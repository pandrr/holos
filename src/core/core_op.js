import { Events, Logger } from "cables-shared-client";
import { cleanJson, shortId } from "./utils.js";
import { CONSTANTS } from "./constants.js";
import { Port } from "./core_port.js";
import { SwitchPort } from "./core_port_switch.js";
import { ValueSelectPort } from "./core_port_select.js";
import { MultiPort } from "./core_port_multi.js";
import { Patch } from "./core_patch.js";

/**
 * configuration object for loading a patch
 * @typedef OpUiAttribs
 * @property {string} [title] overwrite op title
 * @property {String} [title=''] overwrite title of port (by default this is portname)
 * @property {object} [storage] internal - do not use manualy
 * @property {boolean} [working] internal - do not use manualy
 * @property {boolean} [bookmarked] internal - do not use manualy
 * @property {object} [uierrors] internal - do not use manualy - use op.setUiError
 * @property {string} [color]
 * @property {string} [comment]
 * @property {object} [translate]
 * @property {string} [subpatch]
 */

export class Op extends Events
{
    static OP_VERSION_PREFIX = "_v";

    #objName = "";
    #log = new Logger("core_op");
    #name = "";
    #shortOpName = "";

    opId = ""; // unique op id

    /** @type {Array<CABLES.Port>} */
    portsOut = [];

    /** @type {Patch} */
    patch = null;

    data = {}; // UNUSED, DEPRECATED, only left in for backwards compatibility with userops
    storage = {}; // op-specific data to be included in export

    /** @type {Array<Port>} */
    portsIn = [];
    portsInData = []; // original loaded patch data

    /** @type {OpUiAttribs} */
    uiAttribs = {};
    enabled = true;

    onAnimFrame = null;

    preservedPortTitles = {};
    preservedPortValues = {};
    preservedPortLinks = {};

    linkTimeRules = {
        "needsLinkedToWork": [],
        "needsStringToWork": [],
        "needsParentOp": null
    };

    shouldWork = {};
    hasUiErrors = false;

    /** @type {Object} */
    uiErrors = {};
    hasAnimPort = false;

    /**
     * Description
     * @param {Patch} _patch
     * @param {String} _name
     * @param {String} _id=null
    */
    constructor(_patch, _name, _id = null)
    {
        super();

        this.#name = _name;
        this.patch = _patch;

        this.#shortOpName = CABLES.getShortOpName(_name);
        this.getTitle();

        this.id = _id || shortId(); // instance id
        this.onAddPort = null;
        this.onCreate = null;
        this.onResize = null;
        this.onLoaded = null;
        this.onDelete = null;
        this.onError = null;

        this._instances = null;

        /**
         * overwrite this to prerender shader and meshes / will be called by op `loadingStatus`
         * @function preRender
         * @memberof Op
         * @instance
         */
        this.preRender = null;

        /**
         * overwrite this to initialize your op
         * @function init
         * @memberof Op
         * @instance
         */
        this.init = null;

        /**
         * Implement to render 2d canvas based graphics from in an op - optionaly defined in op instance
         * @function renderVizLayer
         * @instance
         * @memberof Op
         * @param {ctx} context of canvas 2d
         * @param {Object} layer info
         * @param {number} layer.x x position on canvas
         * @param {number} layer.y y position on canvas
         * @param {number} layer.width width of canvas
         * @param {number} layer.height height of canvas
         * @param {number} layer.scale current scaling of patchfield view
         */
        this.renderVizLayer = null;

        if (this.initUi) this.initUi();
    }

    get name()
    {
        return this.getTitle();
    }

    set name(n)
    {
        this.setTitle(n);
    }

    set _objName(on)
    {
        this.#objName = on;
        this.#log = new Logger("op " + on);
    }

    get objName()
    {
        return this.#objName;
    }

    get shortName()
    {
        return this.#shortOpName;
    }

    /**
     * op.require
     *
     * @param {String} name - module name
     * @returns {Object}
     */
    require(name)
    {
        if (CABLES.platform && CABLES.StandaloneElectron && !CABLES.platform.frontendOptions.isElectron)
            this.setUiError("notstandalone", "This op will only work in cables standalone version", 3);

        return null;
    }

    checkMainloopExists()
    {
        if (!CABLES.UI) return;
        if (!this.patch.tempData.mainloopOp) this.setUiError("nomainloop", "patch should have a mainloop to use this op");
        else this.setUiError("nomainloop", null);
    }

    /** @returns {string} */
    getTitle()
    {
        if (!this.uiAttribs) return "nouiattribs" + this.#name;

        /*
         * if ((this.uiAttribs.title === undefined || this.uiAttribs.title === "") && this.objName.indexOf("Ops.Ui.") == -1)
         *     this.uiAttribs.title = this._shortOpName;
         */

        return this.uiAttribs.title || this.#shortOpName;
    }

    /**
     * @param {string} title
     */
    setTitle(title)
    {

        /*
         * this.#log.log("settitle", title);
         * this.#log.log(
         *     (new Error()).stack
         * );
         */

        if (title != this.getTitle()) this._setUiAttrib({ "title": title });
    }

    /**
     * @param {Object} newAttribs
     */
    setStorage(newAttribs)
    {
        if (!newAttribs) return;
        this.storage = this.storage || {};

        let changed = false;
        for (const p in newAttribs)
        {
            if (this.storage[p] != newAttribs[p]) changed = true;
            this.storage[p] = newAttribs[p];
        }

        if (changed) this.emitEvent("onStorageChange", newAttribs);
    }

    isSubPatchOp()
    {
        if (this.patchId && this.storage) return (this.storage.subPatchVer || this.storage.blueprintVer || 0);
        return false;
    }

    /**
     * setUiAttrib
     * possible values:
     * <pre>
     * warning - warning message - showing up in op parameter panel
     * error - error message - showing up in op parameter panel
     * extendTitle - op title extension, e.g. [ + ]
     * </pre>
     * @function setUiAttrib
     * @param {OpUiAttribs} newAttribs, e.g. {"attrib":value}
     * @memberof Op
     * @instance
     * @example
     * op.setUiAttrib({"extendTitle":str});
     */
    setUiAttrib(newAttribs)
    {
        this._setUiAttrib(newAttribs);
    }

    /**
     * @deprecated
     * @param {OpUiAttribs} a
     */
    setUiAttribs(a)
    {
        this._setUiAttrib(a);
    }

    /**
     * @deprecated
     * @param {OpUiAttribs} a
     */
    uiAttr(a)
    {
        this._setUiAttrib(a);
    }

    /**
     * @param {OpUiAttribs} newAttribs
     */
    _setUiAttrib(newAttribs)
    {
        if (!newAttribs) return;

        if (newAttribs.error || newAttribs.warning || newAttribs.hint)
            this.#log.warn("old ui error/warning attribute in " + this.#name + ", use op.setUiError !", newAttribs);

        if (typeof newAttribs != "object") this.#log.error("op.uiAttrib attribs are not of type object");
        if (!this.uiAttribs) this.uiAttribs = {};

        let changed = false;
        let emitMove = false;
        if (
            CABLES.UI &&
            newAttribs.hasOwnProperty("translate") &&
            (
                !this.uiAttribs.translate ||
                this.uiAttribs.translate.x != newAttribs.translate.x ||
                this.uiAttribs.translate.y != newAttribs.translate.y
            )) emitMove = true;

        if (newAttribs.hasOwnProperty("title") && newAttribs.title != this.uiAttribs.title)
        {
            // const doEmitEvent = newAttribs.title != this.getTitle();
            this.uiAttribs.title = newAttribs.title;
            // if (doEmitEvent) this.emitEvent("onTitleChange", newAttribs.title);
            changed = true;
            // this.setTitle(newAttribs.title);
        }

        if (newAttribs.hasOwnProperty("disabled")) this.setEnabled(!newAttribs.disabled);

        for (const p in newAttribs)
        {
            if (this.uiAttribs[p] != newAttribs[p]) changed = true;
            this.uiAttribs[p] = newAttribs[p];
        }

        if (this.uiAttribs.hasOwnProperty("selected") && this.uiAttribs.selected == false) delete this.uiAttribs.selected;

        if (changed)
        {
            this.emitEvent("onUiAttribsChange", newAttribs);
            this.patch.emitEvent("onUiAttribsChange", this, newAttribs);
        }

        if (emitMove) this.emitEvent("move");
    }

    getName()
    {
        if (this.uiAttribs.name) return this.uiAttribs.name;
        return this.#name;
    }

    /**
     * @param {Port} p
     */
    addOutPort(p)
    {
        p.direction = CONSTANTS.PORT.PORT_DIR_OUT;
        p._op = this;
        this.portsOut.push(p);
        this.emitEvent("onPortAdd", p);
        return p;
    }

    hasDynamicPort()
    {
        let i = 0;
        for (i = 0; i < this.portsIn.length; i++)
        {
            if (this.portsIn[i].type == Port.TYPE_DYNAMIC) return true;
            if (this.portsIn[i].getName() == "dyn") return true;
        }
        for (i = 0; i < this.portsOut.length; i++)
        {
            if (this.portsOut[i].type == Port.TYPE_DYNAMIC) return true;
            if (this.portsOut[i].getName() == "dyn") return true;
        }

        return false;
    }

    addInPort(p)
    {
        if (!(p instanceof Port)) throw new Error("parameter is not a port!");

        p.direction = Port.DIR_IN;
        p._op = this;

        this.portsIn.push(p);
        this.emitEvent("onPortAdd", p);

        return p;
    }

    /**
     * @deprecated
     */
    inFunction(name, v)
    {
        return this.inTrigger(name, v);
    }

    /**
     * create a trigger input port
     * @function inTrigger
     * @instance
     * @memberof Op
     * @param {String} v
     * @return {Port} created port
     *
     */
    inTrigger(name, v)
    {
        const p = this.addInPort(new Port(this, name, Port.TYPE_FUNCTION));
        if (v !== undefined) p.set(v);
        return p;
    }

    /**
     * create multiple UI trigger buttons
     * @function inTriggerButton
     * @memberof Op
     * @instance
     * @param {String} name
     * @param {Array} v
     * @return {Port} created port
     */

    inTriggerButton(name, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_FUNCTION, {
                "display": "button"
            })
        );
        if (v !== undefined) p.set(v);
        return p;
    }

    inUiTriggerButtons(name, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_FUNCTION, {
                "display": "buttons"
            })
        );
        if (v !== undefined) p.set(v);
        return p;
    }

    /**
     * @deprecated
     */
    inValueFloat(name, v)
    {
        return this.inFloat(name, v);
    }

    /**
     * @deprecated
     */
    inValue(name, v)
    {
        return this.inFloat(name, v);
    }

    /**
     * create a number value input port
     * @function inFloat
     * @memberof Op
     * @instance
     * @param {String} name
     * @param {Number} v
     * @return {Port} created port
     */
    inFloat(name, v)
    {
        const p = this.addInPort(new Port(this, name, Port.TYPE_VALUE));

        p.setInitialValue(v);

        return p;
    }

    /**
     * @deprecated
     */
    inValueBool(name, v)
    {
        return this.inBool(name, v);
    }

    /**
     * create a boolean input port, displayed as a checkbox
     * @function inBool
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {Boolean|number} v
     * @return {Port} created port
     */
    inBool(name, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_NUMBER, {
                "display": "bool"
            })
        );

        if (v === true)v = 1;
        if (v === false)v = 0;
        p.setInitialValue(v);

        return p;
    }

    /**
     * @param {string} name
     * @param {number} type
     */
    inMultiPort(name, type)
    {
        const p = new MultiPort(
            this,
            name,
            type,
            Port.DIR_IN,
            {
                "addPort": true,
                "hidePort": true
            }
        );
        p.ignoreValueSerialize = true;

        this.addInPort(p);
        p.initPorts();

        return p;
    }

    outMultiPort(name, type, uiAttribsPort = {})
    {
        const p = new MultiPort(
            this,
            name,
            type,
            CONSTANTS.PORT.PORT_DIR_OUT,
            {
                "display": "multiport",
                "hidePort": true
            },
            uiAttribsPort
        );
        p.ignoreValueSerialize = true;

        this.addOutPort(p);
        p.initPorts();

        return p;
    }

    /**
     * @param {string} name
     * @param {string} v
     */
    inValueString(name, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_VALUE, {
                "type": "string"
            })
        );
        p.value = "";

        p.setInitialValue(v);
        return p;
    }

    /**
     * create a String value input port
     * @function inString
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {String} v default value
     * @return {Port} created port
     */
    inString(name, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_STRING, {
                "type": "string"
            })
        );
        v = v || "";
        // p.value = v;

        p.setInitialValue(v);
        return p;
    }

    // /**
    //  * create a String value input port displayed as TextArea
    //  * @function inValueText
    //  * @instance
    //  * @memberof Op
    //  * @param {String} name
    //  * @param {String} v default value
    //  * @return {Port} created port
    //  */
    // inValueText(name, v)
    // {
    //     const p = this.addInPort(
    //         new Port(this, name, Port.TYPE_VALUE, {
    //             "type": "string",
    //             "display": "text"
    //         })
    //     );
    //     p.value = "";

    //     p.setInitialValue(v);

    //     /*
    //      * if (v !== undefined)
    //      * {
    //      *     p.set(v);
    //      *     p.defaultValue = v;
    //      * }
    //      */
    //     return p;
    // }

    /**
     * @param {string} name
     * @param {string} v
     */
    inTextarea(name, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_STRING, {
                "type": "string",
                "display": "text"
            })
        );
        p.value = "";
        if (v !== undefined)
        {
            p.set(v);
            p.defaultValue = v;
        }
        return p;
    }

    /**
     * create a String value input port displayed as editor
     * @function inStringEditor
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {String} v default value
     * @param {String} syntax language
     * @param {Boolean} hideFormatButton
     * @return {Port} created port
     */
    inStringEditor(name, v, syntax, hideFormatButton = true)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_STRING, {
                "type": "string",
                "display": "editor",
                "editShortcut": true,
                "editorSyntax": syntax,
                "hideFormatButton": hideFormatButton
            }));

        p.value = "";
        if (v !== undefined)
        {
            p.set(v);
            p.defaultValue = v;
        }
        return p;
    }

    /**
     * @deprecated
     */
    inValueEditor(name, v, syntax, hideFormatButton = true)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_NUMBER, {
                "type": "string",
                "display": "editor",
                "editorSyntax": syntax,
                "hideFormatButton": hideFormatButton
            })
        );
        p.value = "";
        if (v !== undefined)
        {
            p.set(v);
            p.defaultValue = v;
        }
        return p;
    }

    /**
     * @deprecated
     */
    inValueSelect(name, values, v, noindex)
    {
        return this.inDropDown(name, values, v, noindex);
    }

    /**
     * create a string select box
     * @function inDropDown
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {Array} values
     * @param {String} v default value
     * @return {Port} created port
     */
    inDropDown(name, values, v, noindex)
    {
        let p = null;
        if (!noindex)
        {
            const indexPort = new Port(this, name + " index", Port.TYPE_NUMBER, {
                "increment": "integer",
                "hideParam": true
            });
            const n = this.addInPort(indexPort);

            if (values) for (let i = 0; i < values.length; i++) values[i] = String(values[i]);

            const valuePort = new ValueSelectPort(
                this,
                name,
                Port.TYPE_NUMBER,
                {
                    "display": "dropdown",
                    "hidePort": true,
                    "type": "string",
                    "values": values
                },
                n

            );

            valuePort.indexPort = indexPort;

            valuePort.on("change", (val, thePort) =>
            {
                if (!thePort.indexPort.isLinked() && thePort.uiAttribs.values)
                {
                    const idx = thePort.uiAttribs.values.indexOf(val);
                    if (idx > -1) thePort.indexPort.set(idx);
                }
            });

            indexPort.onLinkChanged = () =>
            {
                valuePort.setUiAttribs({ "greyout": indexPort.isLinked() });
            };

            p = this.addInPort(valuePort);

            if (v !== undefined)
            {
                p.set(v);
                const index = values.findIndex((item) => { return item == v; });
                n.setValue(index);
                p.defaultValue = v;
                n.defaultValue = index;
            }
        }
        else
        {
            const valuePort = new Port(this, name, Port.TYPE_VALUE, {
                "display": "dropdown",
                "hidePort": true,
                "type": "string",
                values
            });

            p = this.addInPort(valuePort);
        }

        return p;
    }

    /**
     * create a string switch box
     * @function inSwitch
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {Array} values
     * @param {String} v default value
     * @return {Port} created port
     */
    inSwitch(name, values, v, noindex)
    {
        let p = null;
        if (!noindex)
        {
            if (!v)v = values[0];
            const indexPort = new Port(this, name + " index", Port.TYPE_VALUE, {
                "increment": "integer",
                "values": values,
                "hideParam": true
            });
            const n = this.addInPort(indexPort);

            if (values) for (let i = 0; i < values.length; i++) values[i] = String(values[i]);

            const switchPort = new SwitchPort(
                this,
                name,
                Port.TYPE_STRING,
                {
                    "display": "switch",
                    "hidePort": true,
                    "type": "string",
                    "values": values
                },
                n
            );

            switchPort.indexPort = indexPort;

            switchPort.on("change", (val, thePort) =>
            {
                if (!thePort.indexPort.isLinked() && thePort.uiAttribs.values)
                {
                    const idx = thePort.uiAttribs.values.indexOf(val);
                    if (idx > -1) thePort.indexPort.set(idx);
                }
            });

            indexPort.onLinkChanged = function ()
            {
                switchPort.setUiAttribs({ "greyout": indexPort.isLinked() });
            };
            p = this.addInPort(switchPort);

            if (v !== undefined)
            {
                p.set(v);
                const index = values.findIndex((item) => { return item == v; });
                n.setValue(index);
                p.defaultValue = v;
                n.defaultValue = index;
            }
        }
        else
        {
            const switchPort = new Port(this, name, Port.TYPE_STRING, {
                "display": "switch",
                "hidePort": true,
                "type": "string",
                "values": values
            });
            p = this.addInPort(switchPort);
        }

        return p;
    }

    /**
     * @deprecated
     */
    inValueInt(name, v)
    {
        return this.inInt(name, v);
    }

    /**
     * create a integer input port
     * @function inInt
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {number} v default value
     * @return {Port} created port
     */
    inInt(name, v)
    {
        // old
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_VALUE, {
                "increment": "integer" })
        );
        if (v !== undefined)
        {
            p.set(v);
            p.defaultValue = v;
        }
        return p;
    }

    /**
     * create a file/URL input port
     * @function inURL
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {String} filter
     * @param {String} v
     * @return {Port} created port
     */
    inFile(name, filter, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_VALUE, {
                "display": "file",
                "type": "string",
                "filter": filter
            })
        );
        if (v !== undefined)
        {
            p.set(v);
            p.defaultValue = v;
        }
        return p;
    }

    /**
     * @deprecated
     */
    inUrl(name, filter, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_STRING, {
                "display": "file",
                "type": "string",
                "filter": filter
            })
        );
        if (v !== undefined)
        {
            p.set(v);
            p.defaultValue = v;
        }
        return p;
    }

    /**
     * create a texture input port
     * @function inTexture
     * @instance
     * @memberof Op
     * @param {String} name
     * @return {Port} created port
     */
    inTexture(name, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_OBJECT, {
                "display": "texture",
                "objType": "texture",
                "preview": true
            })
        );
        p.ignoreValueSerialize = true;
        if (v !== undefined) p.set(v);
        return p;
    }

    /**
     * create a object input port
     * @function inObject
     * @instance
     * @memberof Op
     * @param {String} name
     * @return {Port} created port
     */
    inObject(name, v, objType)
    {
        const p = this.addInPort(new Port(this, name, Port.TYPE_OBJECT, { "objType": objType }));
        p.ignoreValueSerialize = true;

        if (v !== undefined) p.set(v);
        return p;
    }

    /**
     * @param {string} name
     * @param {string} v
     */
    inGradient(name, v)
    {
        const p = this.addInPort(
            new Port(this, name, Port.TYPE_VALUE, {
                "display": "gradient"
                // "hidePort": true
            })
        );
        if (v !== undefined) p.set(v);
        return p;
    }

    getPortVisibleIndex(p)
    {
        let ports = this.portsIn;
        if (p.direction == CONSTANTS.PORT_DIR_OUT)ports = this.portsOut;

        let index = 0;
        for (let i = 0; i < ports.length; i++)
        {
            if (ports[i].uiAttribs.hidePort) continue;
            index++;
            if (ports[i] == p) return index;
        }
    }

    /**
     * create a array input port
     * @param {String} name
     * @param {array} v
     * @param {number} stride
     * @return {Port} created port
     */
    inArray(name, v, stride)
    {
        if (!stride && CABLES.isNumeric(v))stride = v;

        const p = this.addInPort(new Port(this, name, Port.TYPE_ARRAY, { "stride": stride }));

        if (v !== undefined && (Array.isArray(v) || v == null)) p.set(v);

        return p;
    }

    /**
     * @deprecated
     */
    inValueSlider(name, v, min, max)
    {
        return this.inFloatSlider(name, v, min, max);
    }

    /**
     * create a value slider input port
     * @function inFloatSlider
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {number} v
     * @param {number} min
     * @param {number} max
     * @return {Port} created port
     */
    inFloatSlider(name, v, min, max)
    {
        const uiattribs = { "display": "range" };

        if (min != undefined && max != undefined)
        {
            uiattribs.min = min;
            uiattribs.max = max;
        }

        const p = this.addInPort(new Port(this, name, Port.TYPE_VALUE, uiattribs));
        if (v !== undefined)
        {
            p.set(v);
            p.defaultValue = v;
        }
        return p;
    }

    /**
     * @deprecated
     */
    outFunction(name, v)
    {
        return this.outTrigger(name, v);
    }

    /**
     * create output trigger port
     * @function outTrigger
     * @instance
     * @memberof Op
     * @param {String} name
     * @return {Port} created port
     */
    outTrigger(name, v)
    {
        // old
        const p = this.addOutPort(new Port(this, name, Port.TYPE_FUNCTION));
        if (v !== undefined) p.set(v);
        return p;
    }

    /**
     * @deprecated
     */
    outValue(name, v)
    {
        return this.outNumber(name, v);
    }

    /**
     * create output value port
     * @function outNumber
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {number} v default value
     * @return {Port} created port
     */
    outNumber(name, v)
    {
        const p = this.addOutPort(new Port(this, name, Port.TYPE_VALUE));
        if (v !== undefined) p.set(v);
        return p;
    }

    /**
     * @deprecated
     */
    outValueBool(name, v)
    {
        return this.outBool(name, v);
    }

    /**
     * deprecated create output boolean port
     * @deprecated
     * @function outBool
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {boolean} v default value
     * @return {Port} created port
     */
    outBool(name, v)
    {
        // old: use outBoolNum
        const p = this.addOutPort(
            new Port(this, name, Port.TYPE_VALUE, {
                "display": "bool"
            })
        );
        if (v !== undefined) p.set(v);
        else p.set(0);
        return p;
    }

    /**
     * create output boolean port,value will be converted to 0 or 1
     * @function outBoolNum
     * @instance
     * @memberof Op
     * @param {String} name
     * @return {Port} created port
     */
    outBoolNum(name, v)
    {
        const p = this.addOutPort(
            new Port(this, name, Port.TYPE_VALUE, {
                "display": "boolnum"
            })
        );

        p.set = function (b)
        {
            this.setValue(b ? 1 : 0);
        }.bind(p);

        if (v !== undefined) p.set(v);
        else p.set(0);
        return p;
    }

    /**
     * @deprecated
     */
    outValueString(name, v)
    {
        const p = this.addOutPort(
            new Port(this, name, Port.TYPE_VALUE, {
                "type": "string"
            })
        );
        if (v !== undefined) p.set(v);
        return p;
    }

    /**
     * create output string port
     * @function outString
     * @instance
     * @memberof Op
     * @param {String} v
     * @return {Port} created port
     */
    outString(name, v)
    {
        const p = this.addOutPort(
            new Port(this, name, Port.TYPE_STRING, {
                "type": "string"
            })
        );
        if (v !== undefined) p.set(v);
        else p.set("");
        return p;
    }

    /**
     * create output object port
     * @function outObject
     * @instance
     * @memberof Op
     * @param {String} name
     * @return {Port} created port
     */
    outObject(name, v, objType)
    {
        const p = this.addOutPort(new Port(this, name, Port.TYPE_OBJECT, { "objType": objType || null }));
        p.set(v || null);
        p.ignoreValueSerialize = true;
        return p;
    }

    /**
     * create output array port
     * @function outArray
     * @instance
     * @memberof Op
     * @param {String} name
     * @return {Port} created port
     */
    outArray(name, v, stride)
    {
        if (!stride && CABLES.isNumeric(v))stride = v;
        const p = this.addOutPort(new Port(this, name, Port.TYPE_ARRAY, { "stride": stride }));
        if (v !== undefined && (Array.isArray(v) || v == null)) p.set(v);

        p.ignoreValueSerialize = true;
        return p;
    }

    /**
     * create output texture port
     * @function outTexture
     * @instance
     * @memberof Op
     * @param {String} name
     * @return {Port} created port
     */
    outTexture(name, v)
    {
        const p = this.addOutPort(
            new Port(this, name, Port.TYPE_OBJECT, {
                "preview": true,
                "objType": "texture",
                "display": "texture"
            })
        );
        if (v !== undefined) p.setRef(v || CGL.Texture.getEmptyTexture(this.patch.cgl));

        p.ignoreValueSerialize = true;
        return p;
    }

    /**
     * @deprecated
     */
    inDynamic(name, filter, options, v)
    {
        const p = new Port(this, name, Port.TYPE_DYNAMIC, options);

        p.shouldLink = (p1, p2) =>
        {
            if (filter && CABLES.isArray(filter))
            {
                for (let i = 0; i < filter.length; i++)
                {
                    if (p1 == this && p2.type === filter[i]) return true;
                    if (p2 == this && p1.type === filter[i]) return true;
                }
                return false; // types do not match
            }
            return true; // no filter set
        };

        this.addInPort(p);
        if (v !== undefined)
        {
            p.set(v);
            p.defaultValue = v;
        }
        return p;
    }

    removeLinks()
    {
        for (let i = 0; i < this.portsIn.length; i++) this.portsIn[i].removeLinks();
        for (let i = 0; i < this.portsOut.length; i++) this.portsOut[i].removeLinks();
    }

    getSerialized()
    {
        const opObj = {};

        if (this.opId) opObj.opId = this.opId;
        if (this.patch.storeObjNames) opObj.objName = this.objName;

        opObj.id = this.id;
        opObj.uiAttribs = JSON.parse(JSON.stringify(this.uiAttribs)) || {};

        if (this.storage && Object.keys(this.storage).length > 0) opObj.storage = JSON.parse(JSON.stringify(this.storage));
        if (this.uiAttribs.hasOwnProperty("working") && this.uiAttribs.working == true) delete this.uiAttribs.working;
        if (opObj.uiAttribs.hasOwnProperty("uierrors")) delete opObj.uiAttribs.uierrors;

        if (opObj.uiAttribs.title === "") delete opObj.uiAttribs.title;
        if (opObj.uiAttribs.color === null) delete opObj.uiAttribs.color;
        if (opObj.uiAttribs.comment === null) delete opObj.uiAttribs.comment;

        if (opObj.uiAttribs.title == this.#shortOpName ||
            (this.uiAttribs.title || "").toLowerCase() == this.#shortOpName.toLowerCase()) delete opObj.uiAttribs.title;

        opObj.portsIn = [];
        opObj.portsOut = [];

        for (let i = 0; i < this.portsIn.length; i++)
        {
            const s = this.portsIn[i].getSerialized();
            if (s) opObj.portsIn.push(s);
        }

        for (let i = 0; i < this.portsOut.length; i++)
        {
            const s = this.portsOut[i].getSerialized();
            if (s) opObj.portsOut.push(s);
        }

        if (opObj.portsIn.length == 0) delete opObj.portsIn;
        if (opObj.portsOut.length == 0) delete opObj.portsOut;
        cleanJson(opObj);

        return opObj;
    }

    getFirstOutPortByType(type)
    {
        for (const ipo in this.portsOut) if (this.portsOut[ipo].type == type) return this.portsOut[ipo];
    }

    getFirstInPortByType(type)
    {
        for (const ipo in this.portsIn) if (this.portsIn[ipo].type == type) return this.portsIn[ipo];
    }

    /**
     * return port by the name portName
     * @function getPort
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {boolean} lowerCase
     * @return {Port}
     */
    getPort(name, lowerCase)
    {
        return this.getPortByName(name, lowerCase);
    }

    /**
     * @param {string} name
     * @param {boolean} lowerCase
     * @returns {Port}
     */
    getPortByName(name, lowerCase = false)
    {
        if (lowerCase)
        {
            for (let ipi = 0; ipi < this.portsIn.length; ipi++)
                if (this.portsIn[ipi].getName().toLowerCase() == name || this.portsIn[ipi].id.toLowerCase() == name)
                    return this.portsIn[ipi];

            for (let ipo = 0; ipo < this.portsOut.length; ipo++)
                if (this.portsOut[ipo].getName().toLowerCase() == name || this.portsOut[ipo].id.toLowerCase() == name)
                    return this.portsOut[ipo];
        }
        else
        {
            for (let ipi = 0; ipi < this.portsIn.length; ipi++)
                if (this.portsIn[ipi].getName() == name || this.portsIn[ipi].id == name)
                    return this.portsIn[ipi];

            for (let ipo = 0; ipo < this.portsOut.length; ipo++)
                if (this.portsOut[ipo].getName() == name || this.portsOut[ipo].id == name)
                    return this.portsOut[ipo];
        }
    }

    /**
     * return port by the name id
     * @function getPortById
     * @instance
     * @memberof Op
     * @param {String} id
     * @return {Port}
     */
    getPortById(id)
    {
        for (let ipi = 0; ipi < this.portsIn.length; ipi++) if (this.portsIn[ipi].id == id) return this.portsIn[ipi];
        for (let ipo = 0; ipo < this.portsOut.length; ipo++) if (this.portsOut[ipo].id == id) return this.portsOut[ipo];
    }

    updateAnims()
    {
        if (this.hasAnimPort)
            for (let i = 0; i < this.portsIn.length; i++) this.portsIn[i].updateAnim();
    }

    log()
    {
        this.#log.log(...arguments);
    }

    /**
     * @deprecated
     */
    error()
    {
        this.#log.error(...arguments);
    }

    logError()
    {
        this.#log.error(...arguments);
    }

    /**
     * @deprecated
     */
    warn()
    {
        this.#log.warn(...arguments);
    }

    logWarn()
    {
        this.#log.warn(...arguments);
    }

    /**
     * @deprecated
     */
    verbose()
    {
        this.#log.verbose(...arguments);
    }

    logVerbose()
    {
        this.#log.verbose(...arguments);
    }

    profile()
    {
        for (let ipi = 0; ipi < this.portsIn.length; ipi++)
        {
            this.portsIn[ipi]._onTriggered = this.portsIn[ipi]._onTriggeredProfiling;
            this.portsIn[ipi].set = this.portsIn[ipi]._onSetProfiling;
        }
    }

    // findParent(objName)
    // {
    //     for (let ipi = 0; ipi < this.portsIn.length; ipi++)
    //     {
    //         if (this.portsIn[ipi].isLinked())
    //         {
    //             if (this.portsIn[ipi].links[0].portOut.parent.objName == objName)
    //                 return this.portsIn[ipi].links[0].portOut.parent;

    //             let found = null;
    //             found = this.portsIn[ipi].links[0].portOut.parent.findParent(objName);
    //             if (found) return found;
    //         }
    //     }
    //     return null;
    // }

    // todo: check instancing stuff?
    cleanUp()
    {
        if (this._instances)
        {
            for (let i = 0; i < this._instances.length; i++)
                if (this._instances[i].onDelete) this._instances[i].onDelete();

            this._instances.length = 0;
        }

        for (let i = 0; i < this.portsIn.length; i++)
            this.portsIn[i].setAnimated(false);

        if (this.onAnimFrame) this.patch.removeOnAnimFrame(this);
    }

    // todo: check instancing stuff?
    instanced(triggerPort)
    {
        return false;

        /*
         * this.#log.log("instanced", this.patch.instancing.numCycles());
         * if (this.patch.instancing.numCycles() === 0) return false;
         */

        /*
         * let i = 0;
         * let ipi = 0;
         * if (!this._instances || this._instances.length != this.patch.instancing.numCycles())
         * {
         *     if (!this._instances) this._instances = [];
         *     this._.log("creating instances of ", this.objName, this.patch.instancing.numCycles(), this._instances.length);
         *     this._instances.length = this.patch.instancing.numCycles();
         */

        /*
         *     for (i = 0; i < this._instances.length; i++)
         *     {
         *         this._instances[i] = this.patch.createOp(this.objName, true);
         *         this._instances[i].instanced ()
         *         {
         *             return false;
         *         };
         *         this._instances[i].uiAttr(this.uiAttribs);
         */

        /*
         *         for (let ipo = 0; ipo < this.portsOut.length; ipo++)
         *         {
         *             if (this.portsOut[ipo].type == Port.TYPE_FUNCTION)
         *             {
         *                 this._instances[i].getPortByName(this.portsOut[ipo].name).trigger = this.portsOut[ipo].trigger.bind(this.portsOut[ipo]);
         *             }
         *         }
         *     }
         */

        /*
         *     for (ipi = 0; ipi < this.portsIn.length; ipi++)
         *     {
         *         this.portsIn[ipi].onChange = null;
         *         this.portsIn[ipi].onValueChanged = null;
         *     }
         * }
         */

        /*
         * const theTriggerPort = null;
         * for (ipi = 0; ipi < this.portsIn.length; ipi++)
         * {
         *     if (
         *         this.portsIn[ipi].type == Port.TYPE_VALUE ||
         *         this.portsIn[ipi].type == Port.TYPE_ARRAY
         *     )
         *     {
         *         this._instances[this.patch.instancing.index()].portsIn[ipi].set(this.portsIn[ipi].get());
         *     }
         *     if (this.portsIn[ipi].type == Port.TYPE_FUNCTION)
         *     {
         *         // if(this._instances[ this.patch.instancing.index() ].portsIn[ipi].name==triggerPort.name)
         *         // theTriggerPort=this._instances[ this.patch.instancing.index() ].portsIn[ipi];
         *     }
         * }
         */

        // if (theTriggerPort) theTriggerPort.onTriggered();

        /*
         * for (ipi = 0; ipi < this.portsOut.length; ipi++)
         * {
         *     if (this.portsOut[ipi].type == Port.TYPE_VALUE)
         *     {
         *         this.portsOut[ipi].set(this._instances[this.patch.instancing.index()].portsOut[ipi].get());
         *     }
         * }
         */

        // return true;
    }

    // todo: check instancing stuff?
    initInstancable()
    {
        //         if(this.isInstanced)
        //         {
        //             this.#log.log('cancel instancing');
        //             return;
        //         }
        //         this._instances=[];
        //         for(var ipi=0;ipi<this.portsIn.length;ipi++)
        //         {
        //             if(this.portsIn[ipi].type==Port.TYPE_VALUE)
        //             {
        //
        //             }
        //             if(this.portsIn[ipi].type==Port.TYPE_FUNCTION)
        //             {
        //                 // var piIndex=ipi;
        //                 this.portsIn[ipi].onTriggered=function(piIndex)
        //                 {
        //
        //                     var i=0;
        // // this.#log.log('trigger',this._instances.length);
        //
        //                 }.bind(this,ipi );
        //
        //             }
        // };
        // this._instances=null;
    }

    // setValues(obj)
    // {
    //     for (const i in obj)
    //     {
    //         const port = this.getPortByName(i);
    //         if (port) port.set(obj[i]);
    //         else this.#log.warn("op.setValues: port not found:", i);
    //     }
    // }

    /**
     * return true if op has this error message id
     * @function hasUiError
     * @param {String} id
     * @returns {Boolean} - has id
     */
    hasUiError(id)
    {
        return this.uiErrors.hasOwnProperty(id) && this.uiErrors[id];
    }

    /**
     * show op error message - set message to null to remove error message
     * @function setUiError
     * @instance
     * @memberof Op
     * @param {string} id error id
     * @param {string} txt text message
     * @param {number} level level
     */
    setUiError(id, txt, level = 2)
    {
        // overwritten in ui: core_extend_op
    }

    // todo: remove
    // setError(id, txt)
    // {
    //     this.#log.warn("old error message op.error() - use op.setUiError()");
    // }

    /**
     * enable/disable op
     * @function
     * @instance
     * @memberof Op
     * @param {boolean} b
     */
    setEnabled(b)
    {
        this.enabled = b;
        this.emitEvent("onEnabledChange", b);
    }

    /**
     * organize ports into a group
     * @function
     * @instance
     * @memberof Op
     * @param {String} name
     * @param {Array} ports
     */
    setPortGroup(name, ports)
    {
        for (let i = 0; i < ports.length; i++)
        {
            if (ports[i])
                if (ports[i].setUiAttribs) ports[i].setUiAttribs({ "group": name });
                else this.#log.error("setPortGroup: invalid port!");
        }
    }

    /**
     * visually indicate ports that they are coordinate inputs
     * @function
     * @instance
     * @memberof Op
     * @param {Port} px
     * @param {Port} py
     * @param {Port} pz
     */
    setUiAxisPorts(px, py, pz)
    {
        if (px) px.setUiAttribs({ "axis": "X" });
        if (py) py.setUiAttribs({ "axis": "Y" });
        if (pz) pz.setUiAttribs({ "axis": "Z" });
    }

    /**
     * remove port from op
     * @function removePort
     * @instance
     * @memberof Op
     * @param {Port} port to remove
     */
    removePort(port)
    {
        for (let ipi = 0; ipi < this.portsIn.length; ipi++)
        {
            if (this.portsIn[ipi] == port)
            {
                this.portsIn.splice(ipi, 1);
                this.emitEvent("onUiAttribsChange", {});
                this.emitEvent("onPortRemoved", {});
                return;
            }
        }
        for (let ipi = 0; ipi < this.portsOut.length; ipi++)
        {
            if (this.portsOut[ipi] == port)
            {
                this.portsOut.splice(ipi, 1);
                this.emitEvent("onUiAttribsChange", {});
                this.emitEvent("onPortRemoved", {});
                return;
            }
        }
    }

    _checkLinksNeededToWork() {}

    /**
     * show a warning of this op is not a child of parentOpName
     * @function
     * @instance
     * @memberof Op
     * @param {String} parentOpName
     */
    toWorkNeedsParent(parentOpName)
    {
        this.linkTimeRules.needsParentOp = parentOpName;
    }

    // /**
    //  * show a warning of this op is a child of parentOpName
    //  * @function
    //  * @instance
    //  * @memberof Op
    //  * @param {String} parentOpName
    //  */
    toWorkShouldNotBeChild(parentOpName, type)
    {
        if (!this.patch.isEditorMode()) return;
        this.linkTimeRules.forbiddenParent = parentOpName;
        if (type != undefined) this.linkTimeRules.forbiddenParentType = type;
    }

    toWorkPortsNeedsString()
    {
        if (!this.patch.isEditorMode()) return;
        for (let i = 0; i < arguments.length; i++)
            if (this.linkTimeRules.needsStringToWork.indexOf(arguments[i]) == -1) this.linkTimeRules.needsStringToWork.push(arguments[i]);
    }

    /**
     * show a small X to indicate op is not working when given ports are not linked
     * @function
     * @instance
     * @memberof Op
     * @param {Port} port1
     * @param {Port} port2
     * @param {Port} port3
     */
    toWorkPortsNeedToBeLinked()
    {
        if (!this.patch.isEditorMode()) return;
        for (let i = 0; i < arguments.length; i++)
            if (this.linkTimeRules.needsLinkedToWork.indexOf(arguments[i]) == -1) this.linkTimeRules.needsLinkedToWork.push(arguments[i]);
    }

    toWorkPortsNeedToBeLinkedReset()
    {
        if (!this.patch.isEditorMode()) return;
        this.linkTimeRules.needsLinkedToWork.length = 0;
        if (this.checkLinkTimeWarnings) this.checkLinkTimeWarnings();
    }

    initVarPorts()
    {
        for (let i = 0; i < this.portsIn.length; i++)
        {
            if (this.portsIn[i].getVariableName()) this.portsIn[i].setVariable(this.portsIn[i].getVariableName());
        }
    }

    /**
     * refresh op parameters, if current op is selected
     * @function
     * @instance
     * @memberof Op
     */
    refreshParams()
    {
        if (this.patch && this.patch.isEditorMode() && this.isCurrentUiOp())
            gui.opParams.show(this);
    }

    /**
     * Returns true if op is selected and parameter are shown in the editor, can only return true if in editor/ui
     * @function isCurrentUiOp
     * @instance
     * @memberof Op
     * @returns {Boolean} - is current ui op
     */
    isCurrentUiOp()
    {
        if (this.patch.isEditorMode()) return gui.patchView.isCurrentOp(this);
    }
}
