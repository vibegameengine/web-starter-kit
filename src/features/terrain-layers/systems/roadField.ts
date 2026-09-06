/**
 * The road showcase's field, shared.
 *
 * `?material=roads` and the layered-terrain pedestal must show the SAME road, so
 * they read the same definition rather than two copies that drift apart. It is
 * the whole surface: where the road covers the ground, where wheels pressed
 * hollows into it, where runoff cut channels, and the terrain height that
 * results once all of that is subtracted from the landform.
 *
 * Local XY of the pedestal plate, metres.
 */
export const ROAD_FIELD_FUNCTIONS = `
float roadDistanceToSegment(vec2 point, vec2 start, vec2 end) {
  vec2 segment = end - start;
  float lengthSquared = max(dot(segment, segment), 0.0001);
  float t = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
  return length(point - (start + segment * t));
}

float roadCoverageForSegment(vec2 point, vec2 start, vec2 end, float core, float falloff) {
  return 1.0 - smoothstep(core, core + falloff, roadDistanceToSegment(point, start, end));
}

float roadCoverageAt(vec2 point) {
  float westEast = max(
    roadCoverageForSegment(point, vec2(-5.4, -3.7), vec2(-1.1, -0.65), 0.82, 0.34),
    roadCoverageForSegment(point, vec2(-1.1, -0.65), vec2(5.25, 2.65), 0.82, 0.34)
  );
  float northSouth = max(
    roadCoverageForSegment(point, vec2(-2.5, 5.3), vec2(0.0, 0.0), 0.74, 0.32),
    roadCoverageForSegment(point, vec2(0.0, 0.0), vec2(2.35, -5.25), 0.74, 0.32)
  );
  return max(westEast, northSouth);
}

// The micro-relief is deliberately sparse and authored.  It describes places where
// a tyre pressed wet soil or runoff collected, rather than a continuous pair of ruts.
float roadSoftDepression(vec2 point, vec2 center, vec2 direction, float halfLength, float halfWidth) {
  vec2 forward = normalize(direction);
  vec2 offset = point - center;
  float along = dot(offset, forward) / halfLength;
  float across = dot(offset, vec2(-forward.y, forward.x)) / halfWidth;
  float ellipse = sqrt(along * along + across * across);
  return 1.0 - smoothstep(0.56, 1.0, ellipse);
}

float roadDepressionAt(vec2 point) {
  // West approach: a soft vehicle press before entering the junction.
  float westEntry = roadSoftDepression(point, vec2(-2.82, -1.90), normalize(vec2(0.81, 0.58)), 0.54, 0.25);
  // Junction: churned low spot, deliberately wider and irregular rather than paired.
  float junctionLow = roadSoftDepression(point, vec2(-0.42, -0.38), normalize(vec2(0.88, 0.47)), 0.47, 0.34);
  // North arm: shallow wash-worn low at the inside shoulder.
  float northShoulder = roadSoftDepression(point, vec2(-1.22, 2.67), normalize(vec2(0.44, -0.90)), 0.46, 0.19);
  // South arm: compacted soft pocket after the turn, not a track continuing to the edge.
  float southExit = roadSoftDepression(point, vec2(1.16, -2.87), normalize(vec2(0.41, -0.91)), 0.42, 0.23);
  return max(max(westEntry, junctionLow), max(northShoulder, southExit)) * roadCoverageAt(point);
}

float roadDrainageStroke(vec2 point, vec2 start, vec2 end, float width, float phase) {
  vec2 segment = end - start;
  float segmentLength = max(length(segment), 0.0001);
  vec2 forward = segment / segmentLength;
  float progress = clamp(dot(point - start, forward) / segmentLength, 0.0, 1.0);
  vec2 closest = start + segment * progress;
  float lateral = dot(point - closest, vec2(-forward.y, forward.x));
  // Rainwater follows the local low, so its line wanders gently instead of reading as a decal stroke.
  float meander = sin(progress * 5.4 + phase) * 0.030 + sin(progress * 12.0 + phase * 1.7) * 0.009;
  float channel = 1.0 - smoothstep(width * 0.44, width, abs(lateral - meander));
  float fadeAtEnds = smoothstep(0.04, 0.18, progress) * (1.0 - smoothstep(0.78, 0.97, progress));
  return channel * fadeAtEnds;
}

float roadDrainageAt(vec2 point) {
  // Water leaves the west approach toward the lower shoulder.
  float westRunoff = roadDrainageStroke(point, vec2(-3.86, -2.74), vec2(-3.12, -2.18), 0.086, 0.7);
  // A second shallow channel connects the junction's low spot to the southern arm.
  float junctionRunoff = roadDrainageStroke(point, vec2(-0.15, -0.53), vec2(0.56, -1.42), 0.072, 2.1);
  return max(westRunoff, junctionRunoff) * roadCoverageAt(point);
}

float roadRutBedAt(vec2 point) {
  return roadDepressionAt(point);
}

float roadTreadStamp(vec2 point, vec2 center, vec2 direction, float halfLength, float halfWidth) {
  vec2 forward = normalize(direction);
  vec2 offset = point - center;
  float along = dot(offset, forward);
  float across = dot(offset, vec2(-forward.y, forward.x));
  float body = roadSoftDepression(point, center, forward, halfLength, halfWidth);
  // Four soft, broken lugs belong to this one short, local imprint.
  float lugs = 0.5 + 0.5 * sin((along / max(halfLength, 0.001)) * 12.6 + across * 7.0);
  return body * smoothstep(0.42, 0.72, lugs);
}

float roadTreadAt(vec2 point) {
  float westPrint = roadTreadStamp(point, vec2(-2.94, -1.98), normalize(vec2(0.81, 0.58)), 0.27, 0.075);
  float junctionPrint = roadTreadStamp(point, vec2(-0.30, -0.32), normalize(vec2(0.88, 0.47)), 0.22, 0.082);
  float northPrint = roadTreadStamp(point, vec2(-1.18, 2.62), normalize(vec2(0.44, -0.90)), 0.20, 0.068);
  return max(max(westPrint, junctionPrint), northPrint) * roadDepressionAt(point);
}

float roadPuddleAt(vec2 point) {
  // This is a wet-soil field, not a separate puddle mesh: low spots and runoff
  // darken and smooth the existing road surface through the same causal mask.
  float settledWater = roadDepressionAt(point) * 0.64;
  float flowingWater = roadDrainageAt(point) * 0.58;
  return max(settledWater, flowingWater);
}
`

export const ROAD_TERRAIN_VERTEX_DECLARATIONS = `
varying vec3 vRoadPaintLocalPosition;
${ROAD_FIELD_FUNCTIONS}

float roadTerrainHeight(vec2 point) {
  float broadUndulation = sin(point.x * 0.58 + point.y * 0.19) * 0.19;
  float crossSlope = cos(point.y * 0.73 - point.x * 0.11) * 0.11;
  float leftKnoll = exp(-dot(point - vec2(-3.15, 1.95), point - vec2(-3.15, 1.95)) * 0.34) * 0.48;
  float rightHollow = exp(-dot(point - vec2(3.55, -2.35), point - vec2(3.55, -2.35)) * 0.42) * -0.24;
  float terrainShape = 0.13 + broadUndulation + crossSlope + leftKnoll + rightHollow;
  float roadCut = roadCoverageAt(point) * 0.070;
  float rutCut = roadRutBedAt(point) * 0.055;
  float puddleCut = roadPuddleAt(point) * 0.018;
  return 0.018 + max(0.0, terrainShape - roadCut - rutCut - puddleCut);
}
`

