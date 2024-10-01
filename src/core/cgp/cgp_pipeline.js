import { Logger } from "cables-shared-client";
import { Uniform } from "../cgl/cgl_shader_uniform.js";

export default class Pipeline
{
    constructor(_cgp, name)
    {
        if (!_cgp) throw new Error("Pipeline constructed without cgp " + name);
        this._name = name;
        this._cgp = _cgp;
        this._isValid = true;
        this._log = new Logger("pipeline");

        this._pipeCfg = null;
        this._renderPipeline = null;

        this._bindGroups = [];

        this._shaderListeners = [];
        this.shaderNeedsPipelineUpdate = false;

        this._old = {};

        this.DEPTH_COMPARE_FUNCS_STRINGS = ["never", "less", "equal", "lessequal", "greater", "notequal", "greaterequal", "always"];

        this._cgp.on("deviceChange", () =>
        {
            this._renderPipeline = null;
        });
    }

    get isValid() { return this._isValid; }

    setName(name)
    {
        this._name = name;
    }

    setShaderListener(oldShader, newShader)
    {
        for (let i = 0; i < this._shaderListeners.length; i++) oldShader.off(this._shaderListeners[i]);

        this._shaderListeners.push(
            newShader.on("compiled", () =>
            {
                // console.log("pipe update shader compileeeeeee");
                // this.needsRebuildReason = "shader changed";
                this.shaderNeedsPipelineUpdate = "shader compiled";
            }));
    }


    getInfo()
    {
        // console.log(this.bindingGroupLayoutEntries);

        const arr = [
            "name: " + this._name,
            "bindgroups: " + this._bindGroups.length

        ];

        if (this.bindingGroupLayoutEntries)arr.push("layouts: " + this.bindingGroupLayoutEntries.length);

        // if (this.bindingGroupLayoutEntries)
        //     for (let i = 0; i < this.bindingGroupLayoutEntries.length; i++)
        //     {
        //         // const lines = JSON.stringify(this.bindingGroupLayoutEntries, 4, true).split(",");
        //         arr.push(...lines);
        //     }

        return arr;
    }

    setPipeline(shader, mesh)
    {
        if (!mesh || !shader)
        {
            console.log("pipeline unknown shader/mesh");
            return;
        }

        if (this._cgp.frameStore.branchProfiler) this._cgp.frameStore.branchStack.push("setPipeline", this.getInfo());

        let needsRebuildReason = "";
        if (!this._renderPipeline) needsRebuildReason = "no renderpipeline";
        if (!this._pipeCfg)needsRebuildReason = "no pipecfg";
        if (this._old.mesh != mesh)needsRebuildReason = "no mesh";
        if (this._old.shader != shader)
        {
            this.setShaderListener(this._old.shader, shader);
            needsRebuildReason = "shader changed";
        }
        if (mesh.needsPipelineUpdate)needsRebuildReason = "mesh needs update";
        if (this.shaderNeedsPipelineUpdate)needsRebuildReason = "shader needs update: " + this.shaderNeedsPipelineUpdate;

        if (this._pipeCfg)
        {
            if (this._pipeCfg.depthStencil.depthWriteEnabled != this._cgp.stateDepthWrite())
            {
                needsRebuildReason = "depth changed";
                this._pipeCfg.depthStencil.depthWriteEnabled = this._cgp.stateDepthWrite();
            }

            if (this._cgp.stateDepthTest() === false)
            {
                if (this._pipeCfg.depthStencil.depthCompare != "never")
                {
                    this._pipeCfg.depthStencil.depthCompare = "never";
                    needsRebuildReason = "depth compare changed";
                }
            }
            else
            if (this._pipeCfg.depthStencil.depthCompare != this._cgp.stateDepthFunc())
            {
                needsRebuildReason = "depth state ";
                this._pipeCfg.depthStencil.depthCompare = this._cgp.stateDepththis._cgp.stateDepthFunc();
            }

            // console.log(this._pipeCfg.primitive.cullMode, this._cgp.stateCullFaceFacing());
            if (this._pipeCfg.primitive.cullMode != this._cgp.stateCullFaceFacing())
            {
                needsRebuildReason = "cullmode change";
                this._pipeCfg.primitive.cullMode = this._cgp.stateCullFaceFacing();
            }
        }

        this._cgp.currentPipeDebug =
        {
            "cfg": this._pipeCfg,
            "bindingGroupEntries": this.bindingGroupEntries,
            "bindingGroupLayoutEntries": this.bindingGroupLayoutEntries
        };


        if (needsRebuildReason != "")
        {
            console.log("rebuild pipe", needsRebuildReason);
            this._cgp.pushErrorScope("createPipeline", { "logger": this._log });

            this._bindGroups = [];

            this._pipeCfg = this.getPipelineObject(shader, mesh);
            this._old.device = this._cgp.device;
            this._old.shader = shader;
            this._old.mesh = mesh;
            this._renderPipeline = this._cgp.device.createRenderPipeline(this._pipeCfg);

            this._cgp.popErrorScope();
        }


        if (this._renderPipeline && this._isValid)
        {
            this._cgp.pushErrorScope("setpipeline", { "logger": this._log });


            this._cgp.passEncoder.setPipeline(this._renderPipeline);

            if (this._cgp.frameStore.branchProfiler) this._cgp.frameStore.branchStack.push("updateUniforms");

            shader.incBindingCounter();

            if (!this._bindGroups[shader.bindingCounter])
            {
                const bindingGroupEntries = [];

                for (let i = 0; i < shader.bindingsVert.length; i++)
                {
                    if (shader.bindingsVert[i].getSizeBytes() > 0)
                    {
                        bindingGroupEntries.push(shader.bindingsVert[i].getBindingGroupEntry(this._cgp.device, shader.bindingCounter));
                    }
                    else console.log("shader defaultBindingVert size 0");
                }
                for (let i = 0; i < shader.bindingsFrag.length; i++)
                {
                    if (shader.bindingsFrag[i].getSizeBytes() > 0)
                    {
                        bindingGroupEntries.push(shader.bindingsFrag[i].getBindingGroupEntry(this._cgp.device, shader.bindingCounter));
                    }
                    else console.log("shader defaultBindingFrag size 0");
                }

                const bg = {
                    "label": "label2",
                    "layout": this.bindGroupLayout,
                    "entries": bindingGroupEntries
                };

                this._bindGroups[shader.bindingCounter] = this._cgp.device.createBindGroup(bg);
            }

            this._bindUniforms(shader, shader.bindingCounter);

            if (this._bindGroups[shader.bindingCounter]) this._cgp.passEncoder.setBindGroup(0, this._bindGroups[shader.bindingCounter]);


            // shader.bindingCounter++;

            if (this._cgp.frameStore.branchProfiler) this._cgp.frameStore.branchStack.pop();

            this._cgp.popErrorScope();
        }
        if (this._cgp.frameStore.branchProfiler) this._cgp.frameStore.branchStack.pop();


        this.shaderNeedsPipelineUpdate = false;
    }

    getPipelineObject(shader, mesh)
    {
        this.bindingGroupLayoutEntries = [];

        for (let i = 0; i < shader.bindingsVert.length; i++)
        {
            if (shader.bindingsVert[i].getSizeBytes() > 0)
            {
                this.bindingGroupLayoutEntries.push(shader.bindingsVert[i].getBindingGroupLayoutEntry());
            }
            else console.log("shader defaultBindingVert size 0");
        }

        for (let i = 0; i < shader.bindingsFrag.length; i++)
        {
            if (shader.bindingsFrag[i].getSizeBytes() > 0)
            {
                this.bindingGroupLayoutEntries.push(shader.bindingsFrag[i].getBindingGroupLayoutEntry());
            }
            else console.log("shader defaultBindingFrag size 0");
        }
        // //////////

        this.bindGroupLayout = this._cgp.device.createBindGroupLayout(
            {
                "label": "bg layout " + this._name,
                "entries": this.bindingGroupLayoutEntries,
            });

        const pipelineLayout = this._cgp.device.createPipelineLayout({
            "label": "pipe layout " + this._name,
            "bindGroupLayouts": [this.bindGroupLayout]
        });


        let buffers = [
            // position
            {
                "arrayStride": 3 * 4, // 3 floats, 4 bytes each
                "attributes": [
                    { "shaderLocation": 0, "offset": 0, "format": "float32x3" },
                ],
            },
            // texcoords
            {
                "arrayStride": 2 * 4, // 2 floats, 4 bytes each
                "attributes": [
                    { "shaderLocation": 2, "offset": 0, "format": "float32x2", },
                ],
            },
            // normals
            {
                "arrayStride": 3 * 4, // 3 floats, 4 bytes each
                "attributes": [
                    { "shaderLocation": 1, "offset": 0, "format": "float32x3" },
                ],
            }];

        // buffers.push(
        //     {
        //         "arrayStride": 16 * 4,
        //         "stepMode": "instance",
        //         "attributes": [
        //             { "shaderLocation": 3, "offset": 0, "format": "float32x16" }, // position
        //         ],
        //     });

        const blend = {
            "color": {
                "srcFactor": "one",
                "dstFactor": "one-minus-src-alpha"
            },
            "alpha": {
                "srcFactor": "one",
                "dstFactor": "one-minus-src-alpha"
            },
        };

        const pipeCfg = {
            // "layout": "auto",
            "label": this._name,
            "layout": pipelineLayout,
            "vertex": {
                "module": shader.shaderModule,
                "entryPoint": "myVSMain",
                "buffers": buffers

            },
            "fragment": {
                "module": shader.shaderModule,
                "entryPoint": "myFSMain",
                "targets": [
                    { "format": this._cgp.presentationFormat,
                        "blend": blend },
                ],
            },
            "primitive": {
                "topology": "triangle-list",
                "cullMode": this._cgp.stateCullFaceFacing(), // back/none/front

                // "point-list",
                // "line-list",
                // "line-strip",
                // "triangle-list",
                // "triangle-strip"
            },
            "depthStencil": {
                "depthWriteEnabled": true,
                "depthCompare": this._cgp.stateDepthFunc(),
                "format": "depth24plus",
            },

        };

        return pipeCfg;
    }


    _bindUniforms(shader, inst)
    {
        // this._cgp.pushErrorScope("pipeline bind uniforms", { "logger": this._log });

        shader.bind();

        if (this._cgp.frameStore.branchProfiler) this._cgp.frameStore.branchStack.push("bind uniforms vert", ["num:" + shader.bindingsVert.length]);
        for (let i = 0; i < shader.bindingsVert.length; i++) shader.bindingsVert[i].update(this._cgp, inst);
        if (this._cgp.frameStore.branchProfiler) this._cgp.frameStore.branchStack.pop();

        if (this._cgp.frameStore.branchProfiler) this._cgp.frameStore.branchStack.push("bind uniforms frag", ["num:" + shader.bindingsFrag.length]);
        for (let i = 0; i < shader.bindingsFrag.length; i++) shader.bindingsFrag[i].update(this._cgp, inst);
        if (this._cgp.frameStore.branchProfiler) this._cgp.frameStore.branchStack.pop();



        // shader.defaultBindingVert.update(this._cgp);

        // this._cgp.popErrorScope((e) =>
        // {
        //     this._isValid = false;
        // });
    }
}
