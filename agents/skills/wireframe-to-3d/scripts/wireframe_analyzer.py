#!/usr/bin/env python3
"""
Wireframe Analyzer — Convert 2D wireframe images to parametric Bezier contours.

Pipeline:
  PNG input → grayscale → binarize (Otsu) → morphological ops → edge detect (Canny)
  → contour extract (Suzuki-Abe) → simplify (RDP) → Bezier fit (least-squares)
  → output Bezier control points ready for Blender

Requires: opencv-python, numpy, scipy, Pillow
"""

import cv2
import numpy as np
from scipy.linalg import lstsq
from pathlib import Path
import json
from typing import List, Tuple, Dict, Optional


class WireframeAnalyzer:
    """Extract and parametrize 2D wireframe contours as Bezier curves."""

    def __init__(self, image_path: str, verbose: bool = False):
        """
        Initialize analyzer with a wireframe image.

        Args:
            image_path: Path to wireframe PNG
            verbose: Print debug info
        """
        self.image_path = Path(image_path)
        self.verbose = verbose
        self.original = cv2.imread(str(image_path))

        if self.original is None:
            raise FileNotFoundError(f"Cannot load {image_path}")

        self.height, self.width = self.original.shape[:2]
        self._log(f"Loaded {image_path}: {self.width}×{self.height}")

    def _log(self, msg: str):
        """Conditional logging."""
        if self.verbose:
            print(f"[WireframeAnalyzer] {msg}")

    def process(self,
                gaussian_kernel: int = 5,
                canny_threshold1: int = 50,
                canny_threshold2: int = 150,
                rdp_epsilon: float = 2.0,
                min_contour_area: float = 100.0,
                line_art: bool = True) -> Dict:
        """
        Run full pipeline: preprocess → edge detect → extract → simplify → fit.

        Args:
            gaussian_kernel: Gaussian blur kernel size (odd)
            canny_threshold1: Lower Canny threshold
            canny_threshold2: Upper Canny threshold
            rdp_epsilon: RDP simplification epsilon (pixels)
            min_contour_area: Minimum contour area to keep (pixels²)

        Returns:
            Dict with keys:
              - 'contours': list of simplified contours (each a list of [x, y])
              - 'bezier_curves': list of Bezier curve control point sets
              - 'debug_images': dict of intermediate images (if verbose)

        Args:
            line_art: If True (default), assumes the input is a clean line drawing
                      (wireframe / technical drawing) — skips Gaussian blur + Canny and
                      traces contours directly on the binarised image. If False, runs the
                      photographic-edge pipeline (Gaussian → Canny → contours).
        """

        # Stage 1: Preprocess (grayscale + Otsu + morphology; blur only for photo mode)
        binary = self._preprocess(gaussian_kernel if not line_art else 0)

        # Stage 2: Edge detection (or skip for line art)
        if line_art:
            # Wireframe / line drawings already have crisp edges; trace the binary directly.
            # Invert so lines are white-on-black (cv2.findContours expects foreground = white).
            edges = cv2.bitwise_not(binary)
        else:
            edges = self._edge_detect_canny(binary, canny_threshold1, canny_threshold2)

        # Stage 3: Contour extraction
        contours = self._extract_contours(edges, min_contour_area)

        # Stage 4: Simplify
        simplified = [self._simplify_contour(c, rdp_epsilon) for c in contours]

        # Stage 5: Bezier fit
        bezier_curves = [self._fit_bezier_cubic(c) for c in simplified]

        result = {
            'contours': simplified,
            'bezier_curves': bezier_curves,
            'metadata': {
                'image_size': (self.width, self.height),
                'num_contours': len(simplified),
                'parameters': {
                    'gaussian_kernel': gaussian_kernel,
                    'canny_threshold1': canny_threshold1,
                    'canny_threshold2': canny_threshold2,
                    'rdp_epsilon': rdp_epsilon,
                    'min_contour_area': min_contour_area,
                }
            }
        }

        if self.verbose:
            result['debug_images'] = {
                'binary': binary,
                'edges': edges,
            }

        return result

    def _preprocess(self, gaussian_kernel: int = 5) -> np.ndarray:
        """
        Grayscale → binarize (Otsu) → morphological ops.

        Returns:
            Binary image (0 or 255 only)
        """
        # Grayscale
        gray = cv2.cvtColor(self.original, cv2.COLOR_BGR2GRAY)
        self._log(f"Converted to grayscale: {gray.shape}")

        # Otsu binarization
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_OTSU)
        self._log("Applied Otsu threshold")

        # Morphological cleanup — only when explicitly requested via gaussian_kernel.
        # Line-art mode (gaussian_kernel=0) skips this entirely because the closing kernel
        # dilates the white background by 2-3 pixels and eats thin black wireframe lines.
        if gaussian_kernel > 0:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
            self._log("Applied morphological closing (3x3)")

            if gaussian_kernel % 2 == 1:
                binary = cv2.GaussianBlur(binary, (gaussian_kernel, gaussian_kernel), 1.0)
                self._log(f"Applied Gaussian blur ({gaussian_kernel}×{gaussian_kernel})")

        return binary

    def _edge_detect_canny(self, binary: np.ndarray,
                           threshold1: int = 50,
                           threshold2: int = 150) -> np.ndarray:
        """
        Canny edge detection with non-maximum suppression.

        Returns:
            Binary edge map (single-pixel-wide edges)
        """
        edges = cv2.Canny(binary, threshold1, threshold2, apertureSize=3)
        self._log(f"Applied Canny edge detection (T1={threshold1}, T2={threshold2})")
        return edges

    def _extract_contours(self, edges: np.ndarray,
                          min_area: float = 100.0) -> List[np.ndarray]:
        """
        Suzuki-Abe contour tracing.

        Returns:
            List of contours, each a numpy array of [x, y] points
        """
        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)

        # Filter by both area (catches solid blobs) AND arc length (catches thin lines).
        # Canny edges are 1-pixel-wide lines whose contours enclose ~0 area; filtering by
        # area alone discards everything. Use whichever metric is larger as the score.
        filtered = []
        for contour in contours:
            area = cv2.contourArea(contour)
            length = cv2.arcLength(contour, closed=False)
            # Use length when area is small (thin edge); use area when contour encloses a region
            score = max(area, length)
            if score >= min_area:
                contour_2d = contour.reshape(-1, 2).astype(np.float32)
                filtered.append(contour_2d)

        self._log(f"Extracted {len(filtered)} contours (filtered from {len(contours)}, min_score={min_area})")
        return filtered

    def _simplify_contour(self, contour: np.ndarray, epsilon: float = 2.0) -> List[Tuple[float, float]]:
        """
        Ramer-Douglas-Peucker polyline simplification.

        Args:
            contour: Nx2 array of [x, y] points
            epsilon: Maximum perpendicular distance threshold (pixels)

        Returns:
            List of simplified point tuples [(x, y), ...]
        """
        # Ensure contour is float32
        contour = contour.astype(np.float32)

        # RDP requires closed contour for proper approximation
        is_closed = True
        simplified = cv2.approxPolyDP(contour, epsilon, closed=is_closed)

        # Reshape and convert to list of tuples
        result = [(pt[0][0], pt[0][1]) for pt in simplified]
        return result

    def _fit_bezier_cubic(self, points: List[Tuple[float, float]],
                          max_error: float = 3.0) -> List[List[Tuple[float, float]]]:
        """
        Fit cubic Bezier curves to contour via least-squares.

        Strategy: Segment contour into 3-point subsequences, fit cubic to each.

        Args:
            points: List of simplified contour points
            max_error: If RMS error > threshold, subdivide and refit

        Returns:
            List of Bezier curve control point lists.
            Each curve has 4 control points: [P0 (start), P1 (handle), P2 (handle), P3 (end)]
        """
        if len(points) < 4:
            # Too few points; return as-is
            return [points]

        curves = []
        i = 0
        segment_length = min(4, len(points))  # 4-point segments

        while i < len(points):
            # Get segment
            end_idx = min(i + segment_length - 1, len(points) - 1)
            segment = points[i:end_idx + 1]

            if len(segment) >= 3:
                # Fit cubic Bezier
                curve = self._fit_bezier_segment(segment)
                curves.append(curve)

                # Move start point of next segment to end point of current
                if end_idx < len(points) - 1:
                    i = end_idx
                else:
                    break
            else:
                break

        return curves if curves else [points]

    def _fit_bezier_segment(self, points: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
        """
        Least-squares fit of cubic Bezier to point set.

        Method:
          1. Estimate parameter values (chord-length parameterization)
          2. Set up linear system: [M_x] {P_x} = {Q_x}, [M_y] {P_y} = {Q_y}
          3. Solve via QR/SVD to minimize ||P(t_i) - Q_i||²

        Args:
            points: List of [x, y] point tuples (minimum 3)

        Returns:
            [P0, P1, P2, P3] — cubic Bezier control points
        """
        Q = np.array(points, dtype=np.float32)
        n = len(Q)

        if n < 3:
            return points

        # Endpoint constraints: P0 = Q[0], P3 = Q[-1]
        P0 = Q[0]
        P3 = Q[-1]

        # Parameter estimation (chord-length parameterization)
        t = np.zeros(n)
        for i in range(1, n):
            t[i] = t[i - 1] + np.linalg.norm(Q[i] - Q[i - 1])
        t = t / t[-1]  # Normalize to [0, 1]

        # Build linear system: solve for P1, P2
        # P(t) = (1-t)³ P0 + 3(1-t)² t P1 + 3(1-t) t² P2 + t³ P3
        # Rearrange: Q_i = (1-t_i)³ P0 + 3(1-t_i)² t_i P1 + 3(1-t_i) t_i² P2 + t_i³ P3
        # Solve for P1, P2:

        A = np.zeros((n, 2), dtype=np.float32)
        b_x = np.zeros(n, dtype=np.float32)
        b_y = np.zeros(n, dtype=np.float32)

        for i in range(n):
            t_i = t[i]
            one_minus_t = 1.0 - t_i

            coeff_p1 = 3 * one_minus_t**2 * t_i
            coeff_p2 = 3 * one_minus_t * t_i**2

            A[i, 0] = coeff_p1
            A[i, 1] = coeff_p2

            # Right-hand side (subtract endpoint contributions)
            b_x[i] = Q[i, 0] - one_minus_t**3 * P0[0] - t_i**3 * P3[0]
            b_y[i] = Q[i, 1] - one_minus_t**3 * P0[1] - t_i**3 * P3[1]

        # Solve least-squares
        try:
            x_sol, _, _, _ = lstsq(A, b_x)
            y_sol, _, _, _ = lstsq(A, b_y)

            P1 = (x_sol[0], y_sol[0])
            P2 = (x_sol[1], y_sol[1])
        except np.linalg.LinAlgError:
            # Fallback: linear interpolation
            P1 = tuple((2 * P0[j] + P3[j]) / 3 for j in range(2))
            P2 = tuple((P0[j] + 2 * P3[j]) / 3 for j in range(2))

        return [P0, P1, P2, P3]

    def export_json(self, result: Dict, output_path: str):
        """
        Export result to JSON for consumption by Blender.

        Args:
            result: Dict from process()
            output_path: Path to write JSON
        """
        # Convert numpy arrays to lists for JSON serialization
        export_data = {
            'metadata': result['metadata'],
            'contours': [[(float(x), float(y)) for x, y in c] for c in result['contours']],
            'bezier_curves': [
                [[(float(x), float(y)) for x, y in curve] for curve in curve_set]
                for curve_set in result['bezier_curves']
            ],
        }

        with open(output_path, 'w') as f:
            json.dump(export_data, f, indent=2)

        self._log(f"Exported to {output_path}")


def main():
    """Example usage."""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python wireframe_analyzer.py <image.png> [output.json]")
        sys.exit(1)

    image_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else image_path.replace('.png', '_analyzed.json')

    analyzer = WireframeAnalyzer(image_path, verbose=True)
    result = analyzer.process(
        gaussian_kernel=5,
        canny_threshold1=50,
        canny_threshold2=150,
        rdp_epsilon=2.0,
        min_contour_area=100.0,
    )

    print(f"\nExtracted {result['metadata']['num_contours']} contours")
    for i, curve_set in enumerate(result['bezier_curves']):
        print(f"  Contour {i}: {len(curve_set)} Bezier curve(s)")

    analyzer.export_json(result, output_path)


if __name__ == '__main__':
    main()
