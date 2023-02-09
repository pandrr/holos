const patchIdIn = op.inString("externalPatchId", "");
const subPatchIdIn = op.inString("subPatchId", "");
const activeIn = op.inBool("active", false);
const gotoIn = op.inTriggerButton("Open patch");
const resolveIn = op.inTriggerButton("Convert to SubPatch");
const portsData = op.inString("portsData", "{}");

const loadingOut = op.outBool("loading", false);
let loadingId = null;
patchIdIn.setUiAttribs({
    "hidePort": true,
    "greyout": false
});
subPatchIdIn.setUiAttribs({
    "hidePort": true,
    "greyout": true
});
portsData.setUiAttribs({ "hidePort": true });
portsData.setUiAttribs({ "hideParam": true });

gotoIn.setUiAttribs({ "greyout": true });
gotoIn.setUiAttribs({ "hidePort": true });

resolveIn.setUiAttribs({ "greyout": true });
resolveIn.setUiAttribs({ "hidePort": true });

let wasPasted = false;
let parentSubPatchId = null;

subPatchIdIn.onChange = () =>
{
    if (!activeIn.get())
    {
        op.setUiError("fetchOps", null);
    }
    if (!loadingOut.get() && activeIn.get() && patchIdIn.get() && subPatchIdIn.get())
    {
        update();
    }
};

if (op.patch.isEditorMode())
{
    gotoIn.onTriggered = function ()
    {
        if (CABLES && CABLES.sandbox && CABLES.sandbox.getCablesUrl())
        {
            window.open(CABLES.sandbox.getCablesUrl() + "/edit/" + patchIdIn.get(), "_blank");
        }
    };

    resolveIn.onTriggered = () =>
    {
        if (CABLES && CABLES.CMD && CABLES.CMD.PATCH)
        {
            CABLES.CMD.PATCH.convertBlueprintToSubpatch(this);
        }
    };

    patchIdIn.onChange = function ()
    {
        if (patchIdIn.get())
        {
            gotoIn.setUiAttribs({ "greyout": false });
            if (!activeIn.get())
            {
                op.setUiError("fetchOps", null);
            }
            if (!loadingOut.get() && activeIn.get() && subPatchIdIn.get())
            {
                update();
            }
        }
        else
        {
            gotoIn.setUiAttribs({ "greyout": true });
        }
    };
}

const protectedPorts = [patchIdIn.id, subPatchIdIn.id, activeIn.id, portsData.id, loadingOut.id, gotoIn.id, resolveIn.id];

if (!activeIn.get())
{
    op.setUiError("inactive", "blueprint is inactive", 0);
}

const restorePorts = () =>
{
    const oldPorts = getOldPorts();
    const portInKeys = Object.keys(oldPorts.portsIn);
    if (op.patch.isEditorMode()) CABLES.UI.undo.pause();
    const newPorts = [];
    for (let i = 0; i < portInKeys.length; i++)
    {
        const oldPortIn = oldPorts.portsIn[portInKeys[i]];
        const newPort = op.addInPort(new CABLES.Port(op, oldPortIn.name, oldPortIn.type));
        if (!wasPasted && Array.isArray(oldPortIn.links))
        {
            oldPortIn.links.forEach((link) =>
            {
                let parent = op.patch.getOpById(link.objOut);
                if (parent)
                {
                    const newLink = op.patch.link(parent, link.portOut, op, newPort.name);
                    if (newLink) newLink.ignoreInSerialize = true;
                }
            });
        }
        if (!newPort.isLinked())
        {
            newPort.set(oldPortIn.value);
        }
        newPort.onLinkChanged = savePortData;

        if (oldPortIn.title)
        {
            newPort.setUiAttribs({ "title": oldPortIn.title });
        }
        newPorts.push(newPort);
    }
    op.setPortGroup("Blueprint Ports", newPorts);

    const portOutKeys = Object.keys(oldPorts.portsOut);
    for (let i = 0; i < portOutKeys.length; i++)
    {
        const oldPortOut = oldPorts.portsOut[portOutKeys[i]];
        const newPort = op.addOutPort(new CABLES.Port(op, oldPortOut.name, oldPortOut.type));
        if (!wasPasted && Array.isArray(oldPortOut.links))
        {
            oldPortOut.links.forEach((link) =>
            {
                let parent = op.patch.getOpById(link.objIn);
                if (parent)
                {
                    const newLink = op.patch.link(op, newPort.name, parent, link.portIn);
                    if (newLink) newLink.ignoreInSerialize = true;
                }
            });
            newPort.onLinkChanged = savePortData;

            if (oldPortOut.title)
            {
                newPort.setUiAttribs({ "title": oldPortOut.title });
            }
        }
    }
    if (op.patch.isEditorMode()) CABLES.UI.undo.resume();
};

activeIn.onChange = () =>
{
    if (!loadingOut.get())
    {
        if (activeIn.get())
        {
            op.setUiError("inactive", null);
            update();
        }
        else
        {
            op.setUiError("fetchOps", null);
            op.setUiError("inactive", "blueprint is inactive", 0);
            removeImportedOps();
            if (wasPasted) wasPasted = false;
        }
    }
};

op.onLoaded = () =>
{
    if (op.uiAttribs)
    {
        wasPasted = op.uiAttribs.pasted;
    }
    cleanupPorts();
    restorePorts();
};

op.onDelete = removeImportedOps;

function update()
{
    loadingOut.set(true);
    const patch = op.patch;
    const patchId = patchIdIn.get();
    const subPatchId = subPatchIdIn.get();
    const blueprintId = patchId + "-" + subPatchId;

    loadingId = op.patch.loading.start("blueprint", blueprintId);

    if (patch.isEditorMode())
    {
        const options = {
            "blueprintId": blueprintId
        };

        CABLES.sandbox.getBlueprintOps(options, (err, response) =>
        {
            op.setUiError("fetchOps", null);
            if (!err)
            {
                removeImportedOps();
                const blueprintData = {};
                blueprintData.ops = response.data.ops;
                blueprintData.settings = op.patch.settings;
                deSerializeBlueprint(blueprintData, subPatchId, true);
            }
            else
            {
                if (err.code === 403)
                {
                    op.setUiError("fetchOps", "You do not have permission to use this Blueprint");
                }
                else if (err.code === 404 && (gui.patchId === patchId))
                {
                    op.setUiError("fetchOps", "Save the patch and reload before using this Blueprint");
                }
                else
                {
                    op.setUiError("fetchOps", "Error fetching Blueprint, code: " + err.code + " (" + err.msg + ")");
                }
            }
            loadingOut.set(false);
            op.patch.loading.finished(loadingId);
            if (wasPasted)
            {
                wasPasted = false;
            }
        });
    }
    else if (CABLES.talkerAPI)
    {
        // use this to workaround /viewer/ and /p/ not being "isEditorMode" but also not having exported assets
        const callbackTalkerApi = (options, next) =>
        {
            if (options.blueprint && options.blueprint.data.blueprintOpId === op.id)
            {
                const blueprintData = options.blueprint;
                blueprintData.settings = op.patch.settings;
                blueprintData.ops = blueprintData.data.ops;
                deSerializeBlueprint(blueprintData, subPatchId, false);
                loadingOut.set(false);
                op.patch.loading.finished(loadingId);
                if (wasPasted)
                {
                    wasPasted = false;
                }
                CABLES.talkerAPI.removeEventListener(callbackTalkerApi);
            }
        };
        CABLES.talkerAPI.addEventListener("blueprint", callbackTalkerApi);
        CABLES.talkerAPI.send("sendBlueprint", { "url": "/" + blueprintId + "/" + patchId + "/" + subPatchId + "/" + op.id + "/" + op.uiAttribs.subPatch });
    }
    else
    {
        let exportId = blueprintId;
        if (CABLES.blueprints && CABLES.blueprints[exportId])
        {
            const blueprintData = CABLES.blueprints[exportId];
            blueprintData.settings = op.patch.settings;
            // for some reason we have to do this in a 0ms timeout to make
            // sure nested blueprints are not loaded before this one created all the ops...
            setTimeout(() =>
            {
                deSerializeBlueprint(blueprintData, subPatchId, false);
                loadingOut.set(false);
                op.patch.loading.finished(loadingId);
                if (wasPasted)
                {
                    wasPasted = false;
                }
            }, 0);
        }
        else
        {
            const blueprintUrl = op.patch.config.prefixJsPath + op.patch.getJsPath() + exportId + ".json";
            CABLES.ajax(
                blueprintUrl,
                function (err, data)
                {
                    if (!err)
                    {
                        const blueprintData = JSON.parse(data);
                        blueprintData.settings = op.patch.settings;
                        deSerializeBlueprint(blueprintData, subPatchId, false);
                    }
                    else
                    {
                        op.logError("failed to load blueprint from", blueprintUrl, err);
                    }
                    loadingOut.set(false);
                    op.patch.loading.finished(loadingId);
                    if (wasPasted)
                    {
                        wasPasted = false;
                    }
                }
            );
        }
    }
}

function deSerializeBlueprint(data, subPatchId, editorMode)
{
    resolveIn.setUiAttribs({ "greyout": true });
    if (Array.isArray(data.ops) && data.ops.length > 0)
    {
        let originalSaveState = null;
        if (editorMode)
        {
            originalSaveState = gui.getSavedState();
            CABLES.UI.undo.pause();

            gui.serverOps.loadProjectDependencies(data, () =>
            {
                data.settings = op.patch.settings;
                data.namespace = op.patch.namespace;
                data.name = op.patch.name;
                data = CABLES.Patch.replaceOpIds(data, op.uiAttribs.subPatch);
                const parentSubPatch = data.ops.find((op) =>
                {
                    let isParent = false;
                    if (op.storage && op.storage.blueprint && op.storage.blueprint.isParentSubPatch) isParent = true;
                    return isParent;
                });
                let subpatchInstance = null;
                if (parentSubPatch)
                {
                    parentSubPatchId = parentSubPatch.id;
                    const patchIdPort = parentSubPatch.portsIn.find((port) => { return port.name === "patchId"; });
                    if (patchIdPort) subpatchInstance = patchIdPort.value;
                }
                op.uiAttribs.subpatchInstance = subpatchInstance;
                op.patch.deSerialize(data, false);
                const originalSubPatchId = gui.patchView.getCurrentSubPatch();
                gui.patchView.setCurrentSubPatch(originalSubPatchId);

                const pSubPatch = op.patch.getOpById(parentSubPatchId);
                if (pSubPatch)
                {
                    op.setUiAttrib({ "extendTitle": pSubPatch.uiAttribs.title });
                    setupPorts(pSubPatch);
                }
                CABLES.UI.undo.resume();
                if (originalSaveState === true)
                {
                    gui.setStateSaved();
                }
                resolveIn.setUiAttribs({ "greyout": false });
            });
        }
        else
        {
            data = CABLES.Patch.replaceOpIds(data);
            const parentSubPatchData = data.ops.find((op) =>
            {
                let isParent = false;
                if (op.storage && op.storage.blueprint && op.storage.blueprint.isParentSubPatch) isParent = true;
                return isParent;
            });
            let subpatchInstance = null;
            if (parentSubPatchData)
            {
                parentSubPatchId = parentSubPatchData.id;
                const patchIdPort = parentSubPatchData.portsIn.find((port) => { return port.name === "patchId"; });
                if (patchIdPort) subpatchInstance = patchIdPort.value;
            }
            op.uiAttribs.subpatchInstance = subpatchInstance;
            op.patch.deSerialize(data, false);
            setupPorts(op.patch.getOpById(parentSubPatchData.id));
        }
    }
}

function removeImportedOps()
{
    if (op.patch.isEditorMode()) CABLES.UI.undo.pause();
    op.patch.deleteOp(parentSubPatchId, op.id);
    if (op.patch.isEditorMode()) CABLES.UI.undo.resume();
}

const getOldPorts = () =>
{
    const oldPorts = JSON.parse(portsData.get());
    let oldPortsOut = {};
    if (oldPorts.portsOut)
    {
        oldPortsOut = oldPorts.portsOut;
    }
    let oldPortsIn = {};
    if (oldPorts.portsIn)
    {
        oldPortsIn = oldPorts.portsIn;
    }
    return {
        "portsIn": oldPortsIn,
        "portsOut": oldPortsOut
    };
};

const cleanupPorts = () =>
{
    const removeInPorts = [];
    const removeOutPorts = [];

    op.portsIn.forEach((port) =>
    {
        if (!protectedPorts.includes(port.id))
        {
            removeInPorts.push(port);
        }
    });
    op.portsOut.forEach((port) =>
    {
        if (!protectedPorts.includes(port.id))
        {
            removeOutPorts.push(port);
        }
    });

    removeInPorts.forEach((port) =>
    {
        removeInPort(port);
        op.emitEvent("onPortRemoved", {});
    });

    removeOutPorts.forEach((port) =>
    {
        removeOutPort(port);
        op.emitEvent("onPortRemoved", {});
    });

    if (removeOutPorts.length > 0 || removeInPorts.length > 0)
    {
        op.emitEvent("onUiAttribsChange", {});
    }
};

const removeInPort = (port) =>
{
    port.removeLinks();
    for (let ipi = 0; ipi < op.portsIn.length; ipi++)
    {
        if (op.portsIn[ipi] == port)
        {
            op.portsIn.splice(ipi, 1);
            return;
        }
    }
};

const removeOutPort = (port) =>
{
    port.removeLinks();
    for (let ipi = 0; ipi < op.portsOut.length; ipi++)
    {
        if (op.portsOut[ipi] == port)
        {
            op.portsOut.splice(ipi, 1);
            return;
        }
    }
};

function setupPorts(subPatch)
{
    if (!subPatch) return;
    const subPatchDataPort = subPatch.portsIn.find((port) => { return port.name === "dataStr"; });
    if (!subPatchDataPort) return;
    if (!subPatchDataPort.get()) return;

    const oldPorts = getOldPorts();
    cleanupPorts();

    const subPatchData = JSON.parse(subPatchDataPort.get());
    const subPatchPortsIn = subPatchData.ports || [];
    const subPatchPortsOut = subPatchData.portsOut || [];
    let i = 0;

    if (op.patch.isEditorMode()) CABLES.UI.undo.pause();
    const newPorts = [];
    for (i = 0; i < subPatchPortsIn.length; i++)
    {
        if (!op.getPortByName(subPatchPortsIn[i].name))
        {
            const subPatchPort = subPatch.portsIn.find((port) => { return port.name == subPatchPortsIn[i].name; });
            const newPort = op.addInPort(new CABLES.Port(op, subPatchPort.name, subPatchPort.type));

            if (subPatchPort)
            {
                switch (subPatchPort.type)
                {
                case CABLES.OP_PORT_TYPE_FUNCTION:
                    newPort.onTriggered = () =>
                    {
                        subPatchPort.onTriggered();
                    };
                    break;
                default:
                    newPort.onChange = () =>
                    {
                        subPatchPort.set(newPort.get());
                        if (!newPort.isLinked())
                        {
                            savePortData();
                        }
                    };
                }
            }

            if (oldPorts.portsIn.hasOwnProperty(newPort.name))
            {
                if (!wasPasted && Array.isArray(oldPorts.portsIn[newPort.name].links))
                {
                    oldPorts.portsIn[newPort.name].links.forEach((link) =>
                    {
                        let parent = op.patch.getOpById(link.objOut);
                        if (parent)
                        {
                            const newLink = op.patch.link(parent, link.portOut, op, newPort.name);
                            if (newLink) newLink.ignoreInSerialize = true;
                        }
                    });
                }
                if (!newPort.isLinked())
                {
                    newPort.set(oldPorts.portsIn[newPort.name].value);
                }
            }
            newPort.onLinkChanged = savePortData;

            if (subPatchPort.title)
            {
                newPort.setUiAttribs({ "title": subPatchPortsIn[i].title });
            }
            else if (subPatchPort.uiAttribs && subPatchPort.uiAttribs.title)
            {
                newPort.setUiAttribs({ "title": subPatchPort.uiAttribs.title });
            }
            if (subPatchPort.uiAttribs && subPatchPort.uiAttribs.objType)
            {
                newPort.setUiAttribs({ "objType": subPatchPort.uiAttribs.objType });
            }
            newPorts.push(newPort);
        }
    }
    op.setPortGroup("Blueprint Ports", newPorts);

    for (i = 0; i < subPatchPortsOut.length; i++)
    {
        if (!op.getPortByName(subPatchPortsOut[i].name))
        {
            const patchPortIn = subPatch.portsIn.find((port) => { return port.name === "patchId"; });
            const patchOutputOP = op.patch.getSubPatchOp(patchPortIn.value, "Ops.Ui.PatchOutput");
            if (patchOutputOP.portsIn)
            {
                const subPatchPort = patchOutputOP.portsIn.find((port) => { return port.name == subPatchPortsOut[i].name; });
                const newPort = op.addOutPort(new CABLES.Port(op, subPatchPort.name, subPatchPort.type));
                newPort.ignoreValueSerialize = true;

                if (subPatchPort)
                {
                    switch (subPatchPort.type)
                    {
                    case CABLES.OP_PORT_TYPE_FUNCTION:
                        subPatchPort.onTriggered = () =>
                        {
                            newPort.trigger();
                        };
                        break;
                    default:
                        subPatchPort.onChange = () =>
                        {
                            newPort.set(subPatchPort.get());
                        };
                    }
                    newPort.set(subPatchPort.get());
                }

                if (oldPorts.portsOut.hasOwnProperty(newPort.name))
                {
                    if (!wasPasted && Array.isArray(oldPorts.portsOut[newPort.name].links))
                    {
                        oldPorts.portsOut[newPort.name].links.forEach((link) =>
                        {
                            let parent = op.patch.getOpById(link.objIn);
                            if (parent)
                            {
                                const newLink = op.patch.link(op, newPort.name, parent, link.portIn);
                                if (newLink) newLink.ignoreInSerialize = true;
                            }
                        });
                    }
                }
                newPort.onLinkChanged = savePortData;

                if (subPatchPort.title)
                {
                    newPort.setUiAttribs({ "title": subPatchPortsOut[i].title });
                }
                else if (subPatchPort.uiAttribs && subPatchPort.uiAttribs.title)
                {
                    newPort.setUiAttribs({ "title": subPatchPort.uiAttribs.title });
                }

                if (subPatchPort.uiAttribs && subPatchPort.uiAttribs.objType)
                {
                    newPort.setUiAttribs({ "objType": subPatchPort.uiAttribs.objType });
                }
            }
        }
    }
    savePortData();
    if (op.patch.isEditorMode()) CABLES.UI.undo.resume();
}

function savePortData()
{
    const newPortsData = {
        "portsIn": {},
        "portsOut": {}
    };
    op.portsIn.forEach((port) =>
    {
        if (!protectedPorts.includes(port.id))
        {
            const portData = {
                "name": port.name,
                "title": port.title,
                "type": port.type,
                "links": []
            };
            if (!port.links || port.links.length === 0) portData.value = port.get();
            port.links.forEach((link) =>
            {
                link.ignoreInSerialize = true;
                const linkData = {
                    "objOut": link.portOut.parent.id,
                    "portOut": link.portOut.name
                };
                portData.links.push(linkData);
            });
            newPortsData.portsIn[port.name] = portData;
        }
    });

    op.portsOut.forEach((port) =>
    {
        if (!protectedPorts.includes(port.id))
        {
            const portData = {
                "name": port.name,
                "title": port.title,
                "type": port.type,
                "links": []
            };
            if (!port.links || port.links.length === 0)
            {
                let portValue = port.get();
                try
                {
                    JSON.stringify(portValue);
                } catch (e)
                {
                    portValue = null;
                }
                portData.value = portValue;
            }
            port.links.forEach((link) =>
            {
                link.ignoreInSerialize = true;
                const linkData = {
                    "objIn": link.portIn.parent.id,
                    "portIn": link.portIn.name
                };
                portData.links.push(linkData);
            });
            newPortsData.portsOut[port.name] = portData;
        }
    });
    const serializedPortsData = JSON.stringify(newPortsData);
    portsData.set(serializedPortsData);
}
