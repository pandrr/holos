import { Logger } from "cables-shared-client";
import { Pipeline } from "./cgp_pipeline.js";
import { CgMesh } from "../cg/cg_mesh.js";
import { Geometry } from "../cg/cg_geom.js";

export class CgpMesh extends CgMesh
{
    #log = new Logger("cgl_mesh");
    needsPipelineUpdate = false;

    constructor(_cgp, __geom)
    {
        super();

        this._cgp = _cgp;
        this._geom = null;
        this.numIndex = 0;
        this.instances = 1;

        this._pipe = new Pipeline(this._cgp, "pipe mesh " + __geom.name, Pipeline.TYPE_RENDER);
        this._numNonIndexed = 0;
        this._positionBuffer = null;
        this._bufVerticesIndizes = null;
        this._attributes = [];

        if (__geom) this.setGeom(__geom);
    }

    _createBuffer(device, data, usage)
    {
        let bo = {
            "size": data.byteLength,
            "usage": usage,
            "mappedAtCreation": true,
        };
        const buffer = device.createBuffer(bo);
        const dst = new data.constructor(buffer.getMappedRange());
        dst.set(data);
        buffer.unmap();
        return buffer;
    }

    /**
     * @function setGeom
     * @memberof Mesh
     * @instance
     * @description set geometry for mesh
     * @param {Geometry} geom geometry
     */
    setGeom(geom)
    {
        this.needsPipelineUpdate = true;
        this._geom = geom;
        this._disposeAttributes();

        this._positionBuffer = this._createBuffer(this._cgp.device, new Float32Array(geom.vertices), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);

        let vi = geom.verticesIndices;
        if (!geom.isIndexed()) vi = Array.from(Array(geom.vertices.length / 3).keys());
        this._numIndices = vi.length;
        this._indicesBuffer = this._createBuffer(this._cgp.device, new Uint32Array(vi), GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);

        if (geom.texCoords && geom.texCoords.length) this.setAttribute("texCoords", geom.texCoords, 2);
        if (geom.vertexNormals && geom.vertexNormals.length) this.setAttribute("normals", geom.vertexNormals, 3);

        this.setAttribute("normals", geom.vertexNormals, 3);
    }

    _disposeAttributes()
    {
        this.needsPipelineUpdate = true;
        for (let i = 0; i < this._attributes.length; i++) this._attributes[i].buffer.destroy();
        this._attributes.length = 0;
    }

    dispose()
    {
        this._disposeAttributes();
    }

    /**
     * @function setAttribute
     * @description update attribute
     * @memberof Mesh
     * @instance
     * @param {String} name attribute name
     * @param {Array} array data
     * @param {Number} itemSize
     * @param {Object} options
     */
    setAttribute(name, array, itemSize, options = {})
    {
        if (!array)
        {
            this.#log.error("mesh addAttribute - no array given! " + name);
            throw new Error();
        }

        let instanced = false;
        if (options.instanced) instanced = options.instanced;

        const buffer = this._createBuffer(this._cgp.device, new Float32Array(array), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);

        const attr = {
            "buffer": buffer,
            "name": name,
            "instanced": instanced,
        };
        this._attributes.push(attr);

        return attr;
    }

    render(shader)
    {
        if (!this._positionBuffer) return;
        if (this.instances <= 0) return;

        shader = shader || this._cgp.getShader();
        if (shader)shader.bind();

        if (!shader || !shader.isValid)
        {
            // this.status = "shader invalid";
            return;
        }

        if (this._cgp.frameStore.branchProfiler) this._cgp.branchProfiler.push("mesh", "geom " + this._geom.name, { "geom ": this._geom.getInfo(), "shader ": shader.getInfo() });

        this._pipe.setName("mesh " + this._geom.name + " " + shader.getName());
        this._pipe.setPipeline(shader, this);

        if (this._pipe.isValid)
        {
            this._cgp.passEncoder.setVertexBuffer(0, this._positionBuffer);
            for (let i = 0; i < this._attributes.length; i++)
            {
                this._cgp.passEncoder.setVertexBuffer(i + 1, this._attributes[i].buffer);
            }

            this._cgp.passEncoder.setIndexBuffer(this._indicesBuffer, "uint32");

            if (this._numNonIndexed)
                this._cgp.passEncoder.draw(this._numIndices, this.instances);
            else
                this._cgp.passEncoder.drawIndexed(this._numIndices, this.instances);
        }

        if (this._cgp.frameStore.branchProfiler) this._cgp.branchProfiler.pop();

        // if (shader)shader.unbind();
    }
}
