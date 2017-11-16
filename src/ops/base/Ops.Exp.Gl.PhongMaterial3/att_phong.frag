{{MODULES_HEAD}}

#ifdef HAS_TEXTURE_DIFFUSE
    UNI sampler2D texDiffuse;
#endif
#ifdef HAS_TEXTURE_SPECULAR
    UNI sampler2D texSpecular;
#endif
#ifdef HAS_TEXTURE_AO
    UNI sampler2D texAo;
#endif

UNI float fresnel;

#ifdef HAS_TEXTURE_NORMAL
    UNI sampler2D texNormal;
    UNI vec3 camPos;
    IN vec3 EyeDirection_cameraspace;
    IN vec3 vertexPos;

    // IN vec3 LightDirection_tangentspace;
    IN vec3 EyeDirection_tangentspace;
    IN mat3 TBN;
    IN mat4 vMatrix;
    IN vec3 mvPos;

#endif


IN vec2 texCoord;

IN vec3 norm;
IN vec4 modelPos;
IN mat3 normalMatrix;

UNI float specular;
UNI float r,g,b,a;

struct Light {
  vec3 pos;
  vec3 color;
  vec3 ambient;
  vec3 specular;
  float falloff;
  float radius;
  float mul;
};

UNI Light lights[NUM_LIGHTS];


float getfallOff(Light light,float distLight)
{
    float denom = distLight / light.radius + 1.0;
    float attenuation = 1.0 / (denom*denom);
    float t = (attenuation - 0.1) / (1.0 - 0.1);

    t=t* (20.0*light.falloff*20.0*light.falloff);

    return min(1.0,max(t, 0.0));
}

float calcFresnel(vec3 direction, vec3 normal)
{
    vec3 nDirection = normalize( direction );
    vec3 nNormal = normalize( normal );
    vec3 halfDirection = normalize( nNormal + nDirection );

    float cosine = dot( halfDirection, nDirection );
    float product = max( cosine, 0.0 );
    float factor = pow( product, 5.0 );

    return factor;
}

void main()
{
    {{MODULE_BEGIN_FRAG}}

    vec3 col=vec3(0.0);
    vec3 normal = normalize(normalMatrix*norm);
  
    #ifdef HAS_TEXTURE_NORMAL
        vec3 TextureNormal_tangentspace = normalize(texture2D(texNormal, texCoord).rgb*2.0-1.0);
    #endif

  
    for(int l=0;l<NUM_LIGHTS;l++)
    {
        Light light=lights[l];

        vec3 lightModelDiff=light.pos - modelPos.xyz;
        vec3 lightDir = normalize(lightModelDiff);
  
      	float distance = length( lightModelDiff );

        #ifdef HAS_TEXTURE_NORMAL

            // 	vec3 LightDirection_tangentspace =  ( ( TBN*(vec4(light.pos,1.0)).xyz  ) ).xyz+modelPos.xyz;
            vec3 LightDirection_tangentspace =  TBN*lightModelDiff;

            // vec3 lightModelDiff=light.pos - modelPos.xyz;

          	// Normal of the computed fragment, in camera space
            // 	vec3 n = TextureNormal_tangentspace;
            // normal=TextureNormal_tangentspace;

            vec3 ll = normalize(LightDirection_tangentspace);
            // vec3 ll = normalize(lightDir);
        	// Cosine of the angle between the normal and the light direction, 
        	// clamped above 0
        	//  - light is at the vertical of the triangle -> 1
        	//  - light is perpendicular to the triangle -> 0
        	//  - light is behind the triangle -> 0
        	float cosTheta = clamp( dot(TextureNormal_tangentspace,ll ), 0.0,1.0 );
        
        
        	// Eye vector (towards the camera)
        	vec3 E = normalize( TBN*(camPos-modelPos.xyz));
        	// Direction in which the triangle reflects the light
        	vec3 R = reflect(-ll,TextureNormal_tangentspace);
        	// Cosine of the angle between the Eye vector and the Reflect vector,
        	// clamped to 0
        	//  - Looking into the reflection -> 1
        	//  - Looking elsewhere -> < 1
        	float cosAlpha = clamp( dot( E,R ), 0.0,1.0 );

        #endif


        #ifndef HAS_TEXTURE_NORMAL
        
            #ifdef SHOW_LAMBERT
                vec3 lambert = vec3( max(dot(lightDir,normal), 0.0) );
                vec3 lambertColor=lambert * light.color.rgb * light.mul;
                lambertColor*=getfallOff(light, length(lightModelDiff));
        
                col+=lambertColor;
            #endif

        #endif

        #ifndef SHOW_LAMBERT
            col=vec3(r,g,b);
        #endif


        col+=vec3(light.ambient);

        
        #ifdef HAS_TEXTURE_NORMAL
        #ifdef SHOW_NORMAL
            #ifdef SHOW_LAMBERT
                col+= light.color.rgb * light.mul*((cosTheta));// (distance*distance));
            #endif
            
            #ifdef SHOW_SPECULAR
                float specMul=specular;
                #ifdef HAS_TEXTURE_SPECULAR
                    specMul*=texture2D(texSpecular, texCoord).r;
                #endif
                
                col+=specMul*pow(cosAlpha,5.0);// (distance*distance);
            #endif

        #endif
        #endif

        #ifndef SHOW_NORMAL
            col=vec3(r,g,b);
        #endif

        #ifdef SHOW_FALLOFF
            col*=getfallOff(light, length(lightModelDiff));
        #endif

    }
    
    
    #ifdef SHOW_DIFFUSE
        #ifdef HAS_TEXTURE_DIFFUSE
            col*= texture2D(texDiffuse, texCoord).rgb;
        #endif
        #ifndef HAS_TEXTURE_DIFFUSE
            col*= vec3(r,g,b);
        #endif
    #endif
    
    #ifndef SHOW_DIFFUSE
        col*=vec3(0.5);
    #endif
    
    #ifdef SHOW_AO
    #ifdef HAS_TEXTURE_AO
        col*= texture2D(texAo, texCoord).rgb;
    #endif
    #endif

    vec3 vNormal = normalize(normalMatrix * norm);
    col+=vec3(r,g,b)*(calcFresnel(normalize(mvPos.xyz),vNormal)*fresnel*5.0);



    {{MODULE_COLOR}}

    outColor=vec4(col,a);
}
