op.name="ArrayPathFollowParticles";

var exec=op.inFunction("Exec");
var inPoints=op.inArray("Points");
var inParticles=op.inValue("Num Particles",500);
var inLength=op.inValue("Length",20);
var inSpread=op.inValue("Spread",0.2);
var inOffset=op.inValue("Offset");
var inRandomSpeed=op.inValueBool("RandomSpeed");

var cgl=op.patch.cgl;
var shaderModule=null;
var shader=null;
var mesh=null;
var needsRebuild=true;
var geom=null;
var updateUniformPoints=false;

exec.onLinkChanged=removeModule;

var pointArray=null;

function resetLater()
{
    needsRebuild=true;
}
inParticles.onChange=resetLater;
inLength.onChange=resetLater;
inSpread.onChange=resetLater;

inPoints.onChange=function()
{
    if(inPoints.get())
    {
        pointArray=new Float32Array(inPoints.get());
        updateUniformPoints=true;
        console.log(inPoints.get().length,"points");
        resetLater();
    }
};

function getRandomVec(size)
{
    return [
            (Math.random()-0.5)*2*size,
            (Math.random()-0.5)*2*size,
            (Math.random()-0.5)*2*size
        ];
}

function rebuild()
{
    op.log("rebuild");
    mesh=null;
    needsRebuild=false;
    var i=0;
    var verts=null;
    var num=Math.abs(Math.floor(inParticles.get())*3);
    if(!verts || verts.length!=num) verts=new Float32Array(num);

    for(i=0;i<verts.length;i+=3)
    {
        verts[i+0]=(Math.random()-0.5);
        verts[i+1]=(Math.random()-0.5);
        verts[i+2]=(Math.random()-0.5);
    }

    if(!geom)geom=new CGL.Geometry();
    geom.setPointVertices(verts);

    if(!mesh) 
    {
        mesh =new CGL.Mesh(cgl,geom,cgl.gl.POINTS);

        mesh.addVertexNumbers=true;
        mesh._verticesNumbers=null;

        op.log("NEW MESH");
    }
    else
    {
        mesh.unBind();
    }
    mesh.setGeom(geom);

    var rndArray=new Float32Array(num);
    for(i=0;i<num/3;i++)
    {
        var v=getRandomVec(inSpread.get());
        while(vec3.len(v)>inSpread.get()/2) v=getRandomVec(inSpread.get());
        
        rndArray[i*3+0]=v[0];
        rndArray[i*3+1]=v[1];
        rndArray[i*3+2]=v[2];

    }
    rndArray[i]=(Math.random()-0.5)*inSpread.get();

    mesh.setAttribute("rndPos",rndArray,3);


    // offset random

    var rndOffset=new Float32Array(num/3);
    for(i=0;i<num/3;i++)
        rndOffset[i]=(Math.random())*inLength.get();

    mesh.setAttribute("rndOffset",rndOffset,1);

    // speed random

    var rndOffset=new Float32Array(num/3);
    for(i=0;i<num/3;i++)
        rndOffset[i]=(Math.random())*inLength.get();

    mesh.setAttribute("rndOffset",rndOffset,1);
    
    
}

function removeModule()
{
    if(shader && shaderModule)
    {
        shader.removeModule(shaderModule);
        shader=null;
    }
}

exec.onTriggered=function()
{
    if(!inPoints.get())return;
    if(needsRebuild)rebuild();

    if(cgl.getShader()!=shader)
    {
        if(shader) removeModule();
        shader=cgl.getShader();
        shader.glslVersion=300;
        shaderModule=shader.addModule(
            {
                name:'MODULE_VERTEX_POSITION',
                srcHeadVert:attachments.pathfollow_head_vert,
                srcBodyVert:attachments.pathfollow_vert
            });

        shaderModule.offset=new CGL.Uniform(shader,'f',shaderModule.prefix+'offset',0);
        shaderModule.point=new CGL.Uniform(shader,'i',shaderModule.prefix+'point',0);
        shaderModule.uniPoints=new CGL.Uniform(shader,'3f[]',shaderModule.prefix+'points',new Float32Array([0,0,0,0,0,0]));
        shaderModule.randomSpeed=new CGL.Uniform(shader,'b',shaderModule.prefix+'randomSpeed',false);
    }
    
    if(updateUniformPoints && pointArray)
    {
        shader.define('PATHFOLLOW_POINTS',pointArray.length/3);
        // shaderModule.uniNumPoints.setValue(pointArray.length/3);
        shaderModule.uniPoints.setValue(pointArray);
        updateUniformPoints=false;
    }

    // var off=inOffset.get()%((pointArray.length-1)/3);
    var off=inOffset.get();

    shaderModule.randomSpeed.setValue(inRandomSpeed.get());
    shaderModule.offset.setValue(off);
    // shaderModule.point.setValue(Math.floor(pointArray.length/3*Math.random() ));

    if(!shader)return;

    if(mesh) mesh.render(shader);

};