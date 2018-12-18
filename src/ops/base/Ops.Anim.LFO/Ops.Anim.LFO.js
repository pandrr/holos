const time=op.inValue("Time");
const type=op.inValueSelect("Type",["sine","triangle","ramp up","ramp down","block"],"sine");
const phase=op.inValue("Phase",0);
const amplitude=op.inValue("Amplitude",1);
const result=op.outValue("Result");


let v=0;
type.onChange=updateType;

updateType();

const PI2=Math.PI/2;


function updateType()
{
    if(type.get()=='sine') time.onChange=sine;
    if(type.get()=='ramp up') time.onChange=rampUp;
    if(type.get()=='ramp down') time.onChange=rampDown;
    if(type.get()=='block') time.onChange=block;
    if(type.get()=='triangle') time.onChange=triangle;
}

function updateTime()
{
    return time.get()+phase.get();
}

function block()
{
    var t=updateTime()+0.5;
    v=t%2.0;
    if(v<=1.0)v=-1;
    else v=1;
    v*=amplitude.get();
    result.set(v);
}

function rampUp()
{
    var t=(updateTime()+1);
    t*=0.5;
    v=t%1.0;
    v-=0.5;
    v*=2.0;
    v*=amplitude.get();
    result.set(v);
}

function rampDown()
{
    var t=updateTime();
    v=t%1.0;
    v-=0.5;
    v*=-2.0;
    v*=amplitude.get();
    result.set(v);
}

function triangle()
{
    var t=updateTime();
    v=t%2.0;
    if(v>1) v= 2.0-v ;
    v-=0.5;
    v*=2.0;
    v*=amplitude.get();
    result.set(v);
}


function sine()
{
    var t=updateTime()*Math.PI-(PI2);
    v=Math.sin( (t) );
    v*=amplitude.get();
    result.set(v);
}