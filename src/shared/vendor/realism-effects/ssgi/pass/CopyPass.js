import { Pass } from "postprocessing"
import { GLSL3, NoBlending, ShaderMaterial, Uniform, WebGLRenderTarget } from "three"
import basicVertexShader from "../../utils/shader/basic.vert"

export class CopyPass extends Pass {
	needsSwap = false

	constructor(textureCount = 1) {
		super("CopyPass")

		this.renderTarget = new WebGLRenderTarget(1, 1, { count: 1, depthBuffer: false })

		this.setTextureCount(textureCount)
	}

	setTextureCount(textureCount) {
		let definitions = ""
		let body = ""
		for (let i = 0; i < textureCount; i++) {
			definitions += /* glsl */ `
				uniform sampler2D inputTexture${i};
				layout(location = ${i}) out vec4 gOutput${i};
			`

			body += /* glsl */ `gOutput${i} = textureLod(inputTexture${i}, vUv, 0.);`
		}

		this.fullscreenMaterial?.dispose()

		this.fullscreenMaterial = new ShaderMaterial({
			fragmentShader: /* glsl */ `
            varying vec2 vUv;
			
			${definitions}

            void main() {
				${body}
            }
            `,
			vertexShader: basicVertexShader,
			glslVersion: GLSL3,
			blending: NoBlending,
			depthWrite: false,
			depthTest: false,
			toneMapped: false
		})

		for (let i = 0; i < textureCount; i++) {
			this.fullscreenMaterial.uniforms["inputTexture" + i] = new Uniform(null)

			if (i >= this.renderTarget.textures.length) {
				const texture = this.renderTarget.textures[0].clone()
				texture.isRenderTargetTexture = true
				this.renderTarget.textures.push(texture)
			}
		}
	}

	setSize(width, height) {
		this.renderTarget.setSize(width, height)
	}

	render(renderer) {
		renderer.setRenderTarget(this.renderTarget)
		renderer.render(this.scene, this.camera)
	}
}
