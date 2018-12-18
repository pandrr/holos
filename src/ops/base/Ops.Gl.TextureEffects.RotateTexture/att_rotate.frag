IN vec2 texCoord;
UNI sampler2D tex;
UNI float amount;
UNI float resX;
UNI float resY;
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
    vec2 uv = texCoord;
    vec2 res = vec2(resX,resY);
    uv -= 0.5;
    pR(uv.xy,rotate * (TAU));
    uv += 0.5;

    #ifdef CROP_IMAGE
    if(uv.x>1.0 ||uv.x<0.0  || uv.y>1.0 ||uv.y<0.0 )
    {
        discard;
        return;
    }
    #endif

    //blend section
    vec4 col=texture(tex,uv);
    //original texture
    vec4 base=texture(tex,texCoord);
    //blend stuff
    col=vec4( _blend(base.rgb,col.rgb) ,1.0);
    col=vec4( mix( col.rgb, base.rgb ,1.0-base.a*amount),1.0);
    outColor= col;
}