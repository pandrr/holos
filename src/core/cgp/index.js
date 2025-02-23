import { CgpContext } from "./cgp_state.js";
import { CgpShader } from "./cgp_shader.js";
import { CgpMesh } from "./cgp_mesh.js";
import { Pipeline } from "./cgp_pipeline.js";
import { Texture } from "./cgp_texture.js";
import { Binding } from "./cgp_binding.js";
import { CgpUniform } from "./cgp_uniform.js";
import { CgpGguBuffer } from "./cgp_gpubuffer.js";
import { MESHES } from "../cgl/cgl_simplerect.js";
import { WebGpuCanvasAttachment } from "./cgp_canvasattachment.js";

const CGP = {
    "Context": CgpContext,
    "Shader": CgpShader,
    "Mesh": CgpMesh,
    "Pipeline": Pipeline,
    "Texture": Texture,
    "Binding": Binding,
    "Uniform": CgpUniform,
    "MESHES": MESHES,
    "GPUBuffer": CgpGguBuffer
};

window.CABLES = window.CABLES || {};
window.CABLES.CGP = CGP;
window.CGP = CGP;
window.CGP.WebGpuCanvasAttachment = WebGpuCanvasAttachment;
window.CGP.Pipeline = Pipeline;

export { CGP };
