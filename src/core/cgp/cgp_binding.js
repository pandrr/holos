import { Logger } from "cables-shared-client";
import { CgpGguBuffer } from "./cgp_gpubuffer.js";
import { CgpContext } from "./cgp_state.js";
import { CgpUniform } from "./cgp_uniform.js";
import { CgpShader } from "./cgp_shader.js";

/**
     * @typedef CgpBindingOptions
     * @property {string} bindingType  "uniform", "storage", "read-only-storage","read-write-storage",
     * @property {string} define
     * @property {number} stage
     * @property {number} index
     * @property {CgpShader} shader
     */

export class Binding
{
    #name = "";
    #options = {};

    /** @type {CgpContext} */
    #cgp = null;

    /** @type {Array<CgpUniform>} */
    uniforms = [];

    /** @type {Array<CgpGguBuffer>} */
    cGpuBuffers = [];

    /** @type {CgpShader} */
    shader = null;

    /** @type {Array<GPUBindGroupEntry>} */
    bindingInstances = [];

    bindingType = "uniform";
    isValid = true;
    changed = 0;
    #index = -1;

    define = "";

    /**
     * Description
     * @param {CgpContext} cgp
     * @param {String} name
     * @param {CgpBindingOptions} [options]
     */
    constructor(cgp, name, options)
    {
        this._log = new Logger("cgp_binding");
        if (typeof options != "object") this._log.error("binding options is not an object");

        this.#name = name;
        this.#cgp = cgp;
        this.#options = options;
        this.define = options.define || "";
        if (options.bindingType) this.bindingType = options.bindingType; //
        this.stage = options.stage;
        if (options.hasOwnProperty("index")) this.#index = options.index;
        if (options.shader) this.shader = options.shader;

        if (this.shader)
        {
            if (this.stage == GPUShaderStage.FRAGMENT) this.shader.bindingsFrag.push(this);
            else if (this.stage == GPUShaderStage.VERTEX) this.shader.bindingsVert.push(this);
            else if (this.stage == GPUShaderStage.COMPUTE) this.shader.bindingsCompute.push(this);
            else this._log.warn("unknown shader stage binding");

            if (this.#index == -1) this.#index = this.shader.getNewBindingIndex();
        }

        if (this.#index == -1) this._log.warn("binding could not get an index", this.#name);

        this.#cgp.on("deviceChange", () =>
        {
            // this.reInit();
        });
    }

    isStruct()
    {
        if (this.bindingType != "uniform") return false;
        if (this.uniforms.length == 0) return false;

        if (this.uniforms.length == 1)
        {
            if (this.uniforms[0].type == "t" || this.uniforms[0].type == "sampler") return false;
        }

        return true;
    }

    /**
     * @param {CgpShader} newShader
     * @returns {Binding}
     */
    copy(newShader)
    {
        const options = {};

        for (const i in this.#options)
            options[i] = this.#options[i];

        options.shader = newShader;

        let binding = new Binding(this.#cgp, this.#name, options);

        for (let i = 0; i < this.uniforms.length; i++)
        {
            binding.addUniform(newShader.getUniform(this.uniforms[i].name)); // .copy(newShader)
        }

        return binding;
    }

    /**
     * @param {CgpUniform} uni
     */
    addUniform(uni)
    {
        this.uniforms.push(uni);
    }

    getSizeBytes()
    {
        let size = 0;
        for (let i = 0; i < this.uniforms.length; i++)
        {
            // this._log.log("UNIFORM!!!", i, this.uniforms[i], this.uniforms[i].getSizeBytes());
            // this._log.log("getSizeBytes", this.uniforms[i], this.uniforms[i].getSizeBytes);
            size += this.uniforms[i].getSizeBytes();
        }
        // if (this.uniforms.length == 0)this._log.log("NO UNIFORMS!!!");
        return size;
    }

    getShaderHeaderCode()
    {
        let str = "";
        let name = this.#name;
        let typeStr = "";

        if (!this.isActive)
        {
            str += "// " + typeStr + " " + this.#name + ": excluded because define " + this.#options.define + "\n";
            return str;
        }

        str += "// bindingType:" + this.bindingType + "\n";
        str += "// uniforms:" + this.uniforms.length + "\n";

        if (this.uniforms.length > 0)
        {
            typeStr = "strct_" + this.#name;
            str += "// " + this.uniforms.length + " uniforms\n";

            if (this.isStruct())
            {
                str += "struct " + typeStr + "\n";
                str += "{\n";
                for (let i = 0; i < this.uniforms.length; i++)
                {

                    str += "    " + this.uniforms[i].name + ": " + this.uniforms[i].getWgslTypeStr();
                    if (i != this.uniforms.length - 1)str += ",";
                    str += "\n";
                }
                str += "};\n";
            }
            else
            {
                typeStr = this.uniforms[0].getWgslTypeStr();
                name = this.uniforms[0].name;
            }
        }

        if (this.bindingType.includes("storage") && this.uniforms.length == 0)
        {
            typeStr = "array<f32>";
        }

        str += "@group(0) ";
        str += "@binding(" + this.#index + ") ";

        if (this.isStruct())
        {
            str += "var<" + this.bindingType + "> ";
        }
        else if (this.bindingType == "read-only-storage")str += "var<storage,read> ";
        else if (this.bindingType == "read-write-storage")str += "var<storage,read_write> ";
        // else str += "// unknown bindingtype: " + this.bindingType;
        else str += "var ";

        str += name + ": " + typeStr + ";\n";

        // @group(0) @binding(0) var<storage, read_write> resultMatrix : array<f32>;

        // if (this.#options.define) str += "#endif\n";

        return str;
    }

    /** @returns {GPUBindGroupLayoutEntry} */
    getBindingGroupLayoutEntry()
    {
        if (!this.isActive) return null;

        let label = "layout " + this.#name + " [";
        for (let i = 0; i < this.uniforms.length; i++) label += this.uniforms[i].getName() + ",";
        label += "]";

        const o = {
            "label": label,
            "binding": this.#index,
            "visibility": this.stage,
            "size": this.getSizeBytes()
        };

        if (this.uniforms.length == 1 && this.uniforms[0].getType() == "t")
        {
            o.texture = {};
        }
        else if (this.uniforms.length == 1 && this.uniforms[0].getType() == "sampler")
        {
            o.sampler = {};
        }
        else
        {
            console.log("unknown bindingGroupLayoutEntry", this.bindingType);
            o.buffer = {};
            o.buffer.type = this.bindingType;
        }

        return o;
    }

    get isActive()
    {
        if (!this.define) return true;
        if (this.define && !this.shader.hasDefine(this.define)) return false;
        return true;
    }

    /**
     * @param {Number} inst
     * @returns {GPUBindGroupEntry}
     */
    getBindingGroupEntry(inst)
    {
        if (!this.isActive) return null;
        this.isValid = false;

        /** @type {GPUBindGroupEntry} */
        const o = {
            "label": this.#name + " binding",
            "binding": this.#index,
            "size": this.getSizeBytes(),
            "visibility": this.stage
        };

        if (this.uniforms.length == 0)
        {
            console.log("binding uniforms length 0", this);
            return;
        }

        if (this.uniforms.length == 1 && this.uniforms[0].getType() == "t")
        {
            if (this.uniforms[0].getValue() && this.uniforms[0].getValue().gpuTexture) o.resource = this.uniforms[0].getValue().gpuTexture.createView();
            else o.resource = this.#cgp.getEmptyTexture().createView();
        }
        else if (this.uniforms.length == 1 && this.uniforms[0].getType() == "sampler")
        {
            let smplDesc = {
                "addressModeU": "mirror-repeat",
                "addressModeV": "mirror-repeat",
                "magFilter": "linear",
                "minFilter": "linear",
                "mipmapFilter": "linear",
            };

            if (this.uniforms[0].getValue())
            {
                if (!this.uniforms[0].getValue().getSampler)
                {
                    this._log.error("uniform texture does not have function getSampler... not a WebGpu Texture?");
                }
                else
                {
                    smplDesc = this.uniforms[0].getValue().getSampler();
                    const sampler = this.uniforms[0]._cgp.device.createSampler(smplDesc);
                    if (sampler)o.resource = sampler;
                }
            }
        }
        else
        {

            console.log("create bufferrrrrrr", inst, this.#name);

            this._createCgpuBuffer(inst);
            o.resource = {
                "buffer": this.cGpuBuffers[inst].gpuBuffer,
                "minBindingSize": this.getSizeBytes(),
                "hasDynamicOffset": 0
            };
        }

        this.isValid = true;
        this.bindingInstances[inst] = o;

        // if (o.hasOwnProperty("resource"))
        // {
        //     console.log("rrrrrr ", o.label, o.resource);
        // }

        return o;
    }

    _createCgpuBuffer(inst)
    {
        let buffCfg = {
            "label": this.#name,
            "size": this.getSizeBytes(),

        };

        if (this.bindingType == "read-write-storage") buffCfg.usage = GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC;
        else if (this.bindingType == "read-only-storage" || this.bindingType == "storage") buffCfg.usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        else if (this.bindingType == "uniform") buffCfg.usage = GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM;
        else this._log.warn("unknown binding type", this.bindingType);

        if (this.cGpuBuffers[inst]) this.cGpuBuffers[inst].dispose();

        this.cGpuBuffers[inst] = new CgpGguBuffer(this.#cgp, this.#name + " buff", null, { "buffCfg": buffCfg });

        if (this.uniforms.length > 0 && this.uniforms[0].gpuBuffer) this.cGpuBuffers[inst] = this.uniforms[0].gpuBuffer;
    }

    /**
     * @param {CgpContext} cgp
     * @param {Number} bindingIndex
     */
    update(cgp, bindingIndex)
    {
        if (!this.isActive) return;

        let b = this.bindingInstances[bindingIndex];
        if (!b) b = this.getBindingGroupEntry(bindingIndex);

        if (this.uniforms.length == 1 && this.uniforms[0].gpuBuffer)
        {
            if (this.uniforms[0].gpuBuffer != this.cGpuBuffers[bindingIndex])
            {
                this._log.log("changed?!");
                this.shader._needsRecompile = true; // TODO this should actually just rebuild the bindinggroup i guess ?
            }

            if (this.#cgp.frameStore.branchProfiler) this.#cgp.frameStore.branchStack.push("extern uni bind", [this.uniforms[0].getName(), this.cGpuBuffers[bindingIndex].floatArr]);
            if (this.#cgp.frameStore.branchProfiler) this.#cgp.frameStore.branchStack.pop();
        }
        else
        if (this.uniforms.length == 1 && this.uniforms[0].getType() == "t")
        {
            if (this.#cgp.frameStore.branchProfiler) this.#cgp.frameStore.branchStack.push("uni texture");
            if (this.uniforms[0].getValue())
                if (this.uniforms[0].getValue().gpuTexture)
                {
                    this.bindingInstances[bindingIndex] = this.getBindingGroupEntry(bindingIndex);
                }
                else
                {
                    this._log.log("uni t has no gputexture");
                    b.resource = this.#cgp.getErrorTexture().createView();
                }

            if (this.#cgp.frameStore.branchProfiler) this.#cgp.frameStore.branchStack.pop();
        }
        else if (this.uniforms.length == 1 && this.uniforms[0].getType() == "sampler")
        {
            if (this.#cgp.frameStore.branchProfiler) this.#cgp.frameStore.branchStack.push("uni sampler");
            b.resource = this.uniforms[0].getValue();
            if (this.#cgp.frameStore.branchProfiler) this.#cgp.frameStore.branchStack.pop();
        }
        else
        {
            let info = ["stage " + CgpShader.getStageString(this.stage) + " / inst " + bindingIndex];

            // this._log.log("B",this.);
            // update uniform values to buffer
            const s = this.getSizeBytes() / 4;

            // if (!this.cGpuBuffers[inst])
            // this._createCgpuBuffer(inst);
            // this.cGpuBuffers[inst] = new GPUBuffer(this._cgp, "buff", null, { "buffCfg": buffCfg });

            if (!this.cGpuBuffers[bindingIndex])
            {
                console.log("no cpubuff? ", this.stage, this.#name);
                return;
            }
            this.cGpuBuffers[bindingIndex].setLength(s);

            let off = 0;
            for (let i = 0; i < this.uniforms.length; i++)
            {
                info.push(this.uniforms[i].getName() + " " + this.uniforms[i].getValue());
                this.uniforms[i].copyToBuffer(this.cGpuBuffers[bindingIndex].floatArr, off); // todo: check if uniform changed?

                // if (isNaN(this.cGpuBuffers[inst].floatArr[0]))
                // {
                // this._log.log("shitttttttt", this.cGpuBuffers[inst].floatArr[0], this.uniforms[i].getName(), this.cGpuBuffers[inst].name, this.uniforms[i]);
                // }

                off += this.uniforms[i].getSizeBytes() / 4;
            }
            if (this.#cgp.frameStore.branchProfiler) this.#cgp.frameStore.branchStack.push("uni buff", info);

            // this._log.log("upodate", inst);

            this.cGpuBuffers[bindingIndex].updateGpuBuffer();
            // todo: only if changed...
            // cgp.device.queue.writeBuffer(
            //     b.resource.buffer,
            //     0,
            //     this._buffer.buffer,
            //     this._buffer.byteOffset,
            //     this._buffer.byteLength
            // );

            if (this.#cgp.frameStore.branchProfiler) this.#cgp.frameStore.branchStack.pop();
        }
    }
}
