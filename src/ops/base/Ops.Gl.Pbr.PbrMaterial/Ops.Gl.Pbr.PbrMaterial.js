// utility
const cgl = op.patch.cgl;
// inputs
const inTrigger = op.inTrigger("render");

const inDiffuseR = op.inFloat("R", Math.random());
const inDiffuseG = op.inFloat("G", Math.random());
const inDiffuseB = op.inFloat("B", Math.random());
const inDiffuseA = op.inFloatSlider("A", 1);
const diffuseColors = [inDiffuseR, inDiffuseG, inDiffuseB, inDiffuseA];
op.setPortGroup("Diffuse Color", diffuseColors);

const inRoughness = op.inFloatSlider("Roughness", 0.5);
const inMetalness = op.inFloatSlider("Metalness", 0.0);
const inAlphaMode = op.inSwitch("Alpha Mode", ["Opaque", "Masked", "Dithered", "Blend"], "Blend");

const inTonemapping = op.inSwitch("Tonemapping", ["sRGB", "HejiDawson", "Photographic"], "sRGB");
const inTonemappingExposure = op.inFloat("Exposure", 1.0);

const inToggleGR = op.inBool("Disable geometric roughness", false);
const inToggleNMGR = op.inBool("Use roughness from normal map", false);
const inUseVertexColours = op.inValueBool("Use Vertex Colours", false);
const inVertexColourMode = op.inSwitch("Vertex Colour Mode", ["colour", "AORM", "AO", "R", "M", "lightmap"], "colour");
const inHeightDepth = op.inFloat("Height Intensity", 1.0);
const inUseOptimizedHeight = op.inValueBool("Faster heightmapping", false);
const inUseClearCoat = op.inValueBool("Use Clear Coat", false);
const inClearCoatRoughness = op.inFloatSlider("Clear Coat Roughness", 0.5);

// texture inputs
const inTexIBLLUT = op.inTexture("IBL LUT");
const inTexIrradiance = op.inTexture("Diffuse Irradiance");
const inTexPrefiltered = op.inTexture("Pre-filtered envmap");
const inMipLevels = op.inInt("Num mip levels");

const inTexAlbedo = op.inTexture("Albedo");
const inTexAORM = op.inTexture("AORM");
const inTexNormal = op.inTexture("Normal map");
const inTexHeight = op.inTexture("Height");
const inLightmap = op.inTexture("Lightmap");
const inDiffuseIntensity = op.inFloat("Diffuse Intensity", 1.0);
const inSpecularIntensity = op.inFloat("Specular Intensity", 1.0);
const inLightmapRGBE = op.inBool("Lightmap is RGBE", false);
const inLightmapIntensity = op.inFloat("Lightmap Intensity", 1.0);

inTrigger.onTriggered = doRender;

// outputs
const outTrigger = op.outTrigger("Next");
const shaderOut = op.outObject("Shader");
shaderOut.ignoreValueSerialize = true;
// UI stuff
op.toWorkPortsNeedToBeLinked(inTrigger);
op.toWorkShouldNotBeChild("Ops.Gl.TextureEffects.ImageCompose", CABLES.OP_PORT_TYPE_FUNCTION);

inDiffuseR.setUiAttribs({ "colorPick": true });
op.setPortGroup("Shader Parameters", [inRoughness, inMetalness, inAlphaMode]);
op.setPortGroup("Advanced Shader Parameters", [inToggleGR, inToggleNMGR, inUseVertexColours, inVertexColourMode, inHeightDepth, inUseOptimizedHeight, inUseClearCoat, inClearCoatRoughness]);
op.setPortGroup("Textures", [inTexAlbedo, inTexAORM, inTexNormal, inTexHeight, inLightmap]);
op.setPortGroup("Lighting", [inDiffuseIntensity, inSpecularIntensity, inLightmapIntensity, inLightmapRGBE, inTexIBLLUT, inTexIrradiance, inTexPrefiltered, inMipLevels]);
op.setPortGroup("Tonemapping", [inTonemapping, inTonemappingExposure]);
// globals
const PBRShader = new CGL.Shader(cgl, "PBRShader");
PBRShader.setModules(["MODULE_VERTEX_POSITION", "MODULE_COLOR", "MODULE_BEGIN_FRAG"]);
// light sources (except IBL)
let PBRLightStack = [];
const lightUniforms = [];
const LIGHT_INDEX_REGEX = new RegExp("{{LIGHT_INDEX}}", "g");
const FRAGMENT_HEAD_REGEX = new RegExp("{{PBR_FRAGMENT_HEAD}}", "g");
const FRAGMENT_BODY_REGEX = new RegExp("{{PBR_FRAGMENT_BODY}}", "g");
const lightFragmentHead = attachments.light_head_frag;
const lightFragmentBodies = {
    "point": attachments.light_body_point_frag,
    "directional": attachments.light_body_directional_frag,
    "spot": attachments.light_body_spot_frag,
};
const createLightFragmentHead = (n) => { return lightFragmentHead.replace("{{LIGHT_INDEX}}", n); };
const createLightFragmentBody = (n, type) =>
{ return (lightFragmentBodies[type] || "").replace(LIGHT_INDEX_REGEX, n); };
let currentLightCount = -1;
const defaultLightStack = [{
    "type": "point",
    "position": [5, 5, 5],
    "color": [1, 1, 1],
    "specular": [1, 1, 1],
    "intensity": 120,
    "attenuation": 0,
    "falloff": 0.5,
    "radius": 60,
    "castLight": 1,
}];

if (cgl.glVersion == 1)
{
    if (!cgl.gl.getExtension("EXT_shader_texture_lod"))
    {
        op.log("no EXT_shader_texture_lod texture extension");
        throw "no EXT_shader_texture_lod texture extension";
    }
    else
    {
        PBRShader.enableExtension("GL_EXT_shader_texture_lod");
        cgl.gl.getExtension("OES_texture_float");
        cgl.gl.getExtension("OES_texture_float_linear");
        cgl.gl.getExtension("OES_texture_half_float");
        cgl.gl.getExtension("OES_texture_half_float_linear");

        PBRShader.enableExtension("GL_OES_standard_derivatives");
        PBRShader.enableExtension("GL_OES_texture_float");
        PBRShader.enableExtension("GL_OES_texture_float_linear");
        PBRShader.enableExtension("GL_OES_texture_half_float");
        PBRShader.enableExtension("GL_OES_texture_half_float_linear");
    }
}

buildShader();
// uniforms

const inAlbedoUniform = new CGL.Uniform(PBRShader, "t", "_AlbedoMap", 0);
const inAORMUniform = new CGL.Uniform(PBRShader, "t", "_AORMMap", 0);
const inNormalUniform = new CGL.Uniform(PBRShader, "t", "_NormalMap", 0);
const inIBLLUTUniform = new CGL.Uniform(PBRShader, "t", "IBL_BRDF_LUT", 0);
const inIrradianceUniform = new CGL.Uniform(PBRShader, "tc", "_irradiance", 1);
const inPrefilteredUniform = new CGL.Uniform(PBRShader, "tc", "_prefilteredEnvironmentColour", 1);
const inMipLevelsUniform = new CGL.Uniform(PBRShader, "f", "MAX_REFLECTION_LOD", 0);

const inTonemappingExposureUniform = new CGL.Uniform(PBRShader, "f", "tonemappingExposure", inTonemappingExposure);
const inDiffuseIntensityUniform = new CGL.Uniform(PBRShader, "f", "diffuseIntensity", inDiffuseIntensity);
const inSpecularIntensityUniform = new CGL.Uniform(PBRShader, "f", "specularIntensity", inSpecularIntensity);

const inHeightUniform = new CGL.Uniform(PBRShader, "t", "_HeightMap", 0);
const inLightmapUniform = new CGL.Uniform(PBRShader, "t", "_Lightmap", 0);
const inLightmapIntensityUniform = new CGL.Uniform(PBRShader, "f", "lightmapIntensity", inLightmapIntensity);

const inDiffuseColor = new CGL.Uniform(PBRShader, "4f", "_Albedo", inDiffuseR, inDiffuseG, inDiffuseB, inDiffuseA);
const inRoughnessUniform = new CGL.Uniform(PBRShader, "f", "_Roughness", inRoughness);
const inMetalnessUniform = new CGL.Uniform(PBRShader, "f", "_Metalness", inMetalness);
const inHeightDepthUniform = new CGL.Uniform(PBRShader, "f", "_HeightDepth", inHeightDepth);
const inClearCoatRoughnessUniform = new CGL.Uniform(PBRShader, "f", "_ClearCoatRoughness", inClearCoatRoughness);

const inPCOrigin = new CGL.Uniform(PBRShader, "3f", "_PCOrigin", [0, 0, 0]);
const inPCboxMin = new CGL.Uniform(PBRShader, "3f", "_PCboxMin", [-1, -1, -1]);
const inPCboxMax = new CGL.Uniform(PBRShader, "3f", "_PCboxMax", [1, 1, 1]);

PBRShader.uniformColorDiffuse = inDiffuseColor;
PBRShader.uniformPbrMetalness = inMetalnessUniform;
PBRShader.uniformPbrRoughness = inRoughnessUniform;

inTexPrefiltered.onChange = updateIBLTexDefines;

inTexAORM.onChange =
    inLightmapRGBE.onChange =
    inUseClearCoat.onChange =
    inTexAlbedo.onChange =
    inTexNormal.onChange =
    inTexHeight.onChange =
    inAlphaMode.onChange =
    inToggleNMGR.onChange =
    inTonemapping.onChange =
    inLightmap.onChange =
    inUseOptimizedHeight.onChange =
    inUseVertexColours.onChange =
    inToggleGR.onChange =
    inVertexColourMode.onChange = updateDefines;

function updateDefines()
{
    PBRShader.toggleDefine("USE_OPTIMIZED_HEIGHT", inUseOptimizedHeight.get());
    PBRShader.toggleDefine("USE_CLEAR_COAT", inUseClearCoat.get());
    PBRShader.toggleDefine("LIGHTMAP_IS_RGBE", inLightmapRGBE.get());
    PBRShader.toggleDefine("USE_LIGHTMAP", inLightmap.isLinked() || inVertexColourMode.get() === "lightmap");
    PBRShader.toggleDefine("USE_NORMAL_TEX", inTexNormal.isLinked());
    PBRShader.toggleDefine("USE_HEIGHT_TEX", inTexHeight.isLinked());
    PBRShader.toggleDefine("DONT_USE_NMGR", inToggleNMGR.get());
    PBRShader.toggleDefine("DONT_USE_GR", inToggleGR.get());

    // VERTEX_COLORS
    PBRShader.toggleDefine("VCOL_COLOUR", inVertexColourMode.get() === "colour");
    PBRShader.toggleDefine("VCOL_AORM", inVertexColourMode.get() === "AORM");
    PBRShader.toggleDefine("VCOL_AO", inVertexColourMode.get() === "AO");
    PBRShader.toggleDefine("VCOL_R", inVertexColourMode.get() === "R");
    PBRShader.toggleDefine("VCOL_M", inVertexColourMode.get() === "M");
    PBRShader.toggleDefine("VCOL_LIGHTMAP", inVertexColourMode.get() === "lightmap");

    // ALBEDO TEX
    PBRShader.toggleDefine("USE_ALBEDO_TEX", inTexAlbedo.get());
    inDiffuseR.setUiAttribs({ "greyout": inTexAlbedo.isLinked() });
    inDiffuseG.setUiAttribs({ "greyout": inTexAlbedo.isLinked() });
    inDiffuseB.setUiAttribs({ "greyout": inTexAlbedo.isLinked() });
    inDiffuseA.setUiAttribs({ "greyout": inTexAlbedo.isLinked() });

    // AORM
    PBRShader.toggleDefine("USE_AORM_TEX", inTexAORM.get());
    inRoughness.setUiAttribs({ "greyout": inTexAORM.isLinked() });
    inMetalness.setUiAttribs({ "greyout": inTexAORM.isLinked() });

    // lightmaps
    PBRShader.toggleDefine("VERTEX_COLORS", inUseVertexColours.get());

    if (!inUseVertexColours.get())
    {
        PBRShader.toggleDefine("USE_LIGHTMAP", inLightmap.get());
    }
    else
    {
        if (inVertexColourMode.get() === "lightmap")
        {
            PBRShader.define("USE_LIGHTMAP");
        }
    }

    // alpha mode
    PBRShader.toggleDefine("ALPHA_MASKED", inAlphaMode.get() === "Masked");
    PBRShader.toggleDefine("ALPHA_DITHERED", inAlphaMode.get() === "Dithered");
    PBRShader.toggleDefine("ALPHA_BLEND", inAlphaMode.get() === "Blend");

    // tonemapping
    PBRShader.toggleDefine("TONEMAP_sRGB", inTonemapping.get() === "sRGB");
    PBRShader.toggleDefine("TONEMAP_HejiDawson", inTonemapping.get() === "HejiDawson");
    PBRShader.toggleDefine("TONEMAP_Photographic", inTonemapping.get() === "Photographic");
}

updateDefines();

function setEnvironmentLighting(enabled)
{
    PBRShader.toggleDefine("USE_ENVIRONMENT_LIGHTING", enabled);
}

op.preRender = function ()
{
    // PBRShader.bind();
    // doRender();
};

function updateIBLTexDefines()
{
    inMipLevels.setUiAttribs({ "greyout": !inTexPrefiltered.get() });
}

function updateLightUniforms()
{
    for (let i = 0; i < PBRLightStack.length; i += 1)
    {
        const light = PBRLightStack[i];
        light.isUsed = true;

        lightUniforms[i].position.setValue(light.position);
        lightUniforms[i].color.setValue(light.color);
        lightUniforms[i].specular.setValue(light.specular);

        lightUniforms[i].lightProperties.setValue([
            light.intensity,
            light.attenuation,
            light.falloff,
            light.radius,
        ]);

        lightUniforms[i].conePointAt.setValue(light.conePointAt);
        lightUniforms[i].spotProperties.setValue([
            light.cosConeAngle,
            light.cosConeAngleInner,
            light.spotExponent,
        ]);

        lightUniforms[i].castLight.setValue(light.castLight);
    }
}

function buildShader()
{
    const vertexShader = attachments.BasicPBR_vert;
    const lightIncludes = attachments.light_includes_frag;
    let fragmentShader = attachments.BasicPBR_frag;

    let fragmentHead = "";
    let fragmentBody = "";

    if (PBRLightStack.length > 0)
    {
        fragmentHead = fragmentHead.concat(lightIncludes);
    }

    for (let i = 0; i < PBRLightStack.length; i += 1)
    {
        const light = PBRLightStack[i];
        const type = light.type;

        fragmentHead = fragmentHead.concat(createLightFragmentHead(i) || "");
        fragmentBody = fragmentBody.concat(createLightFragmentBody(i, light.type) || "");
    }

    fragmentShader = fragmentShader.replace(FRAGMENT_HEAD_REGEX, fragmentHead || "");
    fragmentShader = fragmentShader.replace(FRAGMENT_BODY_REGEX, fragmentBody || "");

    PBRShader.setSource(vertexShader, fragmentShader);
    shaderOut.set(PBRShader);

    for (let i = 0; i < PBRLightStack.length; i += 1)
    {
        lightUniforms[i] = null;
        if (!lightUniforms[i])
        {
            lightUniforms[i] = {
                "color": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".color", [1, 1, 1]),
                "position": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".position", [0, 11, 0]),
                "specular": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".specular", [1, 1, 1]),
                "lightProperties": new CGL.Uniform(PBRShader, "4f", "lightOP" + i + ".lightProperties", [1, 1, 1, 1]),

                "conePointAt": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".conePointAt", vec3.create()),
                "spotProperties": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".spotProperties", [0, 0, 0, 0]),
                "castLight": new CGL.Uniform(PBRShader, "i", "lightOP" + i + ".castLight", 1),

            };
        }
    }
}

function updateLights()
{
    if (cgl.frameStore.lightStack)
    {
        let changed = currentLightCount !== cgl.frameStore.lightStack.length;

        if (!changed)
        {
            for (let i = 0; i < cgl.frameStore.lightStack.length; i++)
            {
                if (PBRLightStack[i] != cgl.frameStore.lightStack[i])
                {
                    console.log(PBRLightStack[i], cgl.frameStore.lightStack[i]);

                    changed = true;
                    break;
                }
            }
        }

        if (changed)
        {
            PBRLightStack.length = 0;
            for (let i = 0; i < cgl.frameStore.lightStack.length; i++)

                PBRLightStack[i] = cgl.frameStore.lightStack[i];
            buildShader();

            currentLightCount = cgl.frameStore.lightStack.length;
        }
    }
}

function doRender()
{
    cgl.pushShader(PBRShader);
    let useDefaultLight = false;

    PBRShader.popTextures();

    let numLights = 0;
    if (cgl.frameStore.lightStack)numLights = cgl.frameStore.lightStack.length;

    if ((!cgl.frameStore.pbrEnvStack || cgl.frameStore.pbrEnvStack.length == 0) &&
        !inLightmap.isLinked() && numLights == 0)

    {
        useDefaultLight = true;
        op.setUiError("deflight", "Default light is enabled. Please add lights or PBREnvironmentLights to your patch to make this warning disappear.", 1);
    }
    else op.setUiError("deflight", null);

    if (cgl.frameStore.pbrEnvStack && cgl.frameStore.pbrEnvStack.length > 0 &&
        cgl.frameStore.pbrEnvStack[cgl.frameStore.pbrEnvStack.length - 1].texIBLLUT.tex && cgl.frameStore.pbrEnvStack[cgl.frameStore.pbrEnvStack.length - 1].texDiffIrr.tex && cgl.frameStore.pbrEnvStack[cgl.frameStore.pbrEnvStack.length - 1].texPreFiltered.tex)
    {
        const pbrEnv = cgl.frameStore.pbrEnvStack[cgl.frameStore.pbrEnvStack.length - 1];

        PBRShader.pushTexture(inIBLLUTUniform, pbrEnv.texIBLLUT.tex);
        PBRShader.pushTexture(inIrradianceUniform, pbrEnv.texDiffIrr.tex, cgl.gl.TEXTURE_CUBE_MAP);
        PBRShader.pushTexture(inPrefilteredUniform, pbrEnv.texPreFiltered.tex, cgl.gl.TEXTURE_CUBE_MAP);
        inMipLevelsUniform.setValue(pbrEnv.texPreFilteredMipLevels || 7);

        PBRShader.toggleDefine("USE_PARALLAX_CORRECTION", pbrEnv.UseParallaxCorrection);
        if (pbrEnv.UseParallaxCorrection)
        {
            inPCOrigin.setValue(pbrEnv.PCOrigin);
            inPCboxMin.setValue(pbrEnv.PCboxMin);
            inPCboxMax.setValue(pbrEnv.PCboxMax);
        }

        setEnvironmentLighting(true);
    }
    else
    {
        setEnvironmentLighting(false);
    }

    if (useDefaultLight)
    {
        const iViewMatrix = mat4.create();
        mat4.invert(iViewMatrix, cgl.vMatrix);

        defaultLightStack[0].position = [iViewMatrix[12], iViewMatrix[13], iViewMatrix[14]];
        cgl.frameStore.lightStack = defaultLightStack;
    }

    if (inTexIBLLUT.get())
    {
        setEnvironmentLighting(true);
        PBRShader.pushTexture(inIBLLUTUniform, inTexIBLLUT.get().tex);
        inMipLevelsUniform.setValue(inMipLevels.get());
        if (inTexIrradiance.get()) PBRShader.pushTexture(inIrradianceUniform, inTexIrradiance.get().cubemap, cgl.gl.TEXTURE_CUBE_MAP);
        if (inTexPrefiltered.get()) PBRShader.pushTexture(inPrefilteredUniform, inTexPrefiltered.get().cubemap, cgl.gl.TEXTURE_CUBE_MAP);
    }

    if (inTexAlbedo.get()) PBRShader.pushTexture(inAlbedoUniform, inTexAlbedo.get().tex);
    if (inTexAORM.get()) PBRShader.pushTexture(inAORMUniform, inTexAORM.get().tex);
    if (inTexNormal.get()) PBRShader.pushTexture(inNormalUniform, inTexNormal.get().tex);
    if (inTexHeight.get()) PBRShader.pushTexture(inHeightUniform, inTexHeight.get().tex);
    if (inLightmap.get()) PBRShader.pushTexture(inLightmapUniform, inLightmap.get().tex);

    updateLights();
    updateLightUniforms();

    outTrigger.trigger();
    cgl.popShader();

    if (useDefaultLight) cgl.frameStore.lightStack = [];
}
