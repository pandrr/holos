op.render=op.inTrigger("render");
op.trigger=op.outTrigger("trigger");

var axis=op.inValueSelect("Axis",["X","Y"],"X");
var inTreshhold=op.inValueSlider("treshhold",0.3);

const cgl=op.patch.cgl;
var shader=null;

var srcHeadFrag=''
    .endl()+'UNI float MOD_treshhold;'
    .endl();

var moduleFrag=null;

axis.onChange=updateAxis;

function updateAxis()
{
    if(!shader)return;
    shader.toggleDefine(moduleFrag.prefix+"AXIS_X",axis.get()=='X');
    shader.toggleDefine(moduleFrag.prefix+"AXIS_Y",axis.get()=='Y');
}


function removeModule()
{
    if(shader && moduleFrag) shader.removeModule(moduleFrag);
    shader=null;
}

op.render.onLinkChanged=removeModule;

op.render.onTriggered=function()
{
    if(!cgl.getShader())
    {
         op.trigger.trigger();
         return;
    }

    if(cgl.getShader()!=shader)
    {
        if(shader) removeModule();
        shader=cgl.getShader();

        moduleFrag=shader.addModule(
            {
                title:op.objName,
                name:'MODULE_COLOR',
                srcHeadFrag:srcHeadFrag,
                srcBodyFrag:attachments.limitByTexCoords_frag||''
            });

        inTreshhold.treshhold=new CGL.Uniform(shader,'f',moduleFrag.prefix+'treshhold',inTreshhold);
        updateAxis();
    }

    if(!shader)return;

    op.trigger.trigger();
};
