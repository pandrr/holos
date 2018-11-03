IN vec2 texCoord;
UNI sampler2D tex;
UNI float lineSize;
UNI float amount;
UNI float rotate;

{{BLENDCODE}}

#define PI 3.14159265
#define TAU (2.0*PI)

void pR(inout vec2 p, float a)
{
	p = cos(a)*p + sin(a)*vec2(p.y, -p.x);
}

void main()
{
    vec2 uv = texCoord-0.5;
    pR(uv.xy,rotate * (TAU));
    float total = floor(uv.x*lineSize-lineSize/2.0) +floor(uv.y*lineSize-lineSize/2.0);
    float r = mod(total,2.0);

    //blend section
    vec4 col=vec4(r,r,r,1.0);
    //original texture
    vec4 base=texture2D(tex,uv);
    //blend stuff
    col=vec4( _blend(base.rgb,col.rgb) ,1.0);
    col=vec4( mix( col.rgb, base.rgb ,1.0-base.a*amount),1.0);
    outColor= col;
}