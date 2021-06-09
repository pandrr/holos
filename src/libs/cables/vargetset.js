const VarSetOpWrapper = class
{
    constructor(op, type, valuePort, varNamePort, triggerPort, nextPort)
    {
        this._valuePort = valuePort;
        this._varNamePort = varNamePort;
        this._op = op;
        this._type = type;
        this._triggerPort = triggerPort;
        this._nextPort = nextPort;

        this._btnCreate = op.inTriggerButton("Create new variable");
        this._btnCreate.setUiAttribs({ "hidePort": true });
        this._btnCreate.onTriggered = this._createVar.bind(this);

        this._helper = op.inUiTriggerButtons("", ["Rename"]);
        this._helper.setUiAttribs({ "hidePort": true });
        this._helper.onTriggered = (which) => { if (which == "Rename") CABLES.CMD.PATCH.renameVariable(op.varName.get()); };

        this._op.setPortGroup("Variable", [this._helper, this._varNamePort, this._btnCreate]);

        this._op.on("uiParamPanel", this._updateVarNamesDropdown.bind(this));

        // this._op.patch.addEventListener("variableDeleted", this._updateVarNamesDropdown.bind(this));
        this._op.patch.addEventListener("variablesChanged", this._updateName.bind(this));
        this._op.patch.addEventListener("variableRename", this._renameVar.bind(this));

        this._varNamePort.onChange = this._updateName.bind(this);

        this._valuePort.changeAlways = true;

        if (this._triggerPort)
        {
            this._triggerPort.onTriggered = () =>
            {
                this._setVarValue(true);
            };
        }
        else
        {
            this._valuePort.onChange = this._setVarValue.bind(this);
        }


        this._op.init = () =>
        {
            this._updateName();
            if (!this._triggerPort) this._setVarValue();
            this._updateErrorUi();
        };
    }

    _updateErrorUi()
    {
        if (CABLES.UI)
        {
            if (!this._varNamePort.get()) this._op.setUiError("novarname", "no variable selected");
            else this._op.setUiError("novarname", null);
        }
    }

    _updateName()
    {
        const varname = this._varNamePort.get();
        this._op.setTitle("var set ");
        this._op.setUiAttrib({ "extendTitle": "#" + varname });

        this._updateErrorUi();

        const vari = this._op.patch.getVar(varname);
        if (vari && !vari.type) vari.type = this._type;

        if (!this._op.patch.hasVar(varname) && varname != 0 && !this._triggerPort)
        {
            console.log("var does not exist", varname);

            this._setVarValue(); // this should not be done!!!, its kept because of compatibility anxiety
        }

        if (this._op.isCurrentUiOp())
        {
            this._updateVarNamesDropdown();
            this._op.refreshParams();
        }
        this._updateDisplay();
    }

    _createVar()
    {
        CABLES.CMD.PATCH.createVariable(this._op, this._type, () => { this._updateName(); });
    }

    _updateDisplay()
    {
        this._valuePort.setUiAttribs({ "greyout": !this._varNamePort.get() });
    }

    _updateVarNamesDropdown()
    {
        if (CABLES.UI)
        {
            const varnames = [];
            const vars = this._op.patch.getVars();
            for (const i in vars) if (vars[i].type == this._type && i != "0") varnames.push(i);
            this._varNamePort.uiAttribs.values = varnames;
        }
    }

    _renameVar(oldname, newname)
    {
        if (oldname != this._varNamePort.get()) return;
        this._varNamePort.set(newname);
        this._updateName();
    }

    _setVarValue(triggered)
    {
        if (!this._varNamePort.get()) return;// console.warn("[vargetset] no varnameport");

        const name = this._varNamePort.get();

        if (CABLES.watchVars && CABLES.watchVars[name])
            console.log(this._op.getTitle(), "change var ", name, "to", this._valuePort.get(), this._op.id);

        this._op.patch.setVarValue(name, this._valuePort.get());

        if (triggered && this._nextPort) this._nextPort.trigger();
    }
};

const VarGetOpWrapper = class
{
    constructor(op, type, varnamePort, valueOutPort)
    {
        this._op = op;
        this._type = type;
        this._varnamePort = varnamePort;
        this._variable = null;
        this._valueOutPort = valueOutPort;

        this._op.on("uiParamPanel", this._updateVarNamesDropdown.bind(this));
        this._op.patch.on("variableRename", this._renameVar.bind(this));
        this._op.patch.on("variableDeleted", (oldname) =>
        {
            if (this._op.isCurrentUiOp()) this._op.refreshParams();
        });

        this._varnamePort.onChange = this._init.bind(this);
        this._op.patch.addEventListener("variablesChanged", this._init.bind(this));

        this._op.onDelete = function ()
        {
            if (this._variable) this._variable.removeListener(this._setValueOut.bind(this));
        };

        this._op.init = () =>
        {
            this._init();
        };
    }

    _renameVar(oldname, newname)
    {
        if (oldname != this._varnamePort.get()) return;
        this._varnamePort.set(newname);
        this._updateVarNamesDropdown();
    }

    _updateVarNamesDropdown()
    {
        if (CABLES.UI)
        {
            const varnames = [];
            const vars = this._op.patch.getVars();

            for (const i in vars)
                if (vars[i].type == this._type && i != "0")
                    varnames.push(i);

            this._op.varName.uiAttribs.values = varnames;
        }
    }


    _setValueOut(v)
    {
        this._updateVarNamesDropdown();
        this._valueOutPort.set(v);
    }


    _init()
    {
        this._updateVarNamesDropdown();

        if (this._variable) this._variable.removeListener(this._setValueOut.bind(this));
        this._variable = this._op.patch.getVar(this._op.varName.get());

        if (this._variable)
        {
            this._variable.addListener(this._setValueOut.bind(this));
            this._op.setUiError("unknownvar", null);
            this._op.setTitle("var get ");
            this._op.setUiAttrib({ "extendTitle": "#" + this._varnamePort.get() });
            this._valueOutPort.set(this._variable.getValue());
        }
        else
        {
            this._op.setUiError("unknownvar", "unknown variable! - there is no setVariable with this name (" + this._varnamePort.get() + ")");
            // this._op.setTitle("#invalid");
            this._op.setUiAttrib({ "extendTitle": "#invalid" });
            this._valueOutPort.set(0);
        }
    }
};

CABLES.VarSetOpWrapper = VarSetOpWrapper;
CABLES.VarGetOpWrapper = VarGetOpWrapper;
