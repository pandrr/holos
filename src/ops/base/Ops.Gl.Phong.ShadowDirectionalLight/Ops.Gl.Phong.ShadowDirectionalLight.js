const cgl = op.patch.cgl;
const MAX_UNIFORM_FRAGMENTS = cgl.gl.getParameter(cgl.gl.MAX_FRAGMENT_UNIFORM_VECTORS);
const MAX_SHADOWMAPS = MAX_UNIFORM_FRAGMENTS === 64 ? 2 : 8;

function ShadowInfo() {
    const m11 = cgl.pMatrix[4 * 0 + 0];
    const m13 = cgl.pMatrix[4 * 2 + 0];
    const m14 = cgl.pMatrix[4 * 3 + 0];
    const m22 = cgl.pMatrix[4 * 1 + 1];
    const m23 = cgl.pMatrix[4 * 2 + 1];
    const m24 = cgl.pMatrix[4 * 3 + 1];
    const m33 = cgl.pMatrix[4 * 2 + 2];
    const m34 = cgl.pMatrix[4 * 3 + 2];

    /*
    const near = m34 / (m33 - 1);
    const far = m34 / (m33 + 1);
    const top = near * (m23 + 1) / m22;
    const bottom = near * (m23 - 1) / m22;
    const left = near * (m13 - 1) / m11;
    const right = near * (m13 + 1) / m11;
    */

    this.projMatrix = mat4.create();
  // ortho(out, left, right, bottom, top, near, far)
     mat4.ortho(this.projMatrix, -8, 8, -8, 8, 0.1, 30);
  return this;
}

function Light(config) {
     this.type = config.type || "directional";
     this.color = config.color || [1, 1, 1];
     this.specular = config.specular || [0, 0, 0];
     this.position = config.position || null;
     this.intensity = config.intensity || 1;
     this.spotExponent = config.spotExponent || 1;
     this.cosConeAngleInner = Math.cos(CGL.DEG2RAD*config.coneAngleInner) || 0; // spot light
     this.coneAngleInner = config.coneAngleInner;
     this.coneAngle = config.coneAngle || 0; // spot light
     this.cosConeAngle = config.cosConeAngle || 0;
     this.conePointAt = config.conePointAt || [0, 0, 0];
     this.shadowInfo = new ShadowInfo();
     this.shadowMap = null;
     this.shadowMapIndex = null;
     this.mvpBiasMatrix = null;
     return this;
}

// * FRAMEBUFFER *
var fb = null;
if(cgl.glVersion==1) fb = new CGL.Framebuffer(cgl, 1024, 1024);
else {
    fb = new CGL.Framebuffer2(cgl,1024,1024, {
        // multisampling: true,
        isFloatingPointTexture:true,
        // multisampling:true,
        filter: CGL.Texture.FILTER_LINEAR,
         //shadowMap:true
    });
}

// * SHADER *
const shader = new CGL.Shader(cgl, "shadowDirLight");
shader.setModules(['MODULE_VERTEX_POSITION', 'MODULE_COLOR', 'MODULE_BEGIN_FRAG']);
shader.setSource(attachments.shadow_vert, attachments.shadow_frag);
// shader.offScreenPass = true;

cgl.shaderToRender = shader;

const blurShader = new CGL.Shader(cgl, "shadowBlur");
blurShader.setSource(blurShader.getDefaultVertexShader(), attachments.blur_frag);
const effect = new CGL.TextureEffect(cgl, { isFloatingPointTexture: true });

const outputTexture =new CGL.Texture(cgl, {
        name: "shadowMap",
        isFloatingPointTexture: true,
        filter: CGL.Texture.FILTER_LINEAR,
        width: 1024,
        height: 1024,
    });





const inTrigger = op.inTrigger("Trigger In");
const inPosX = op.inFloat("X", 0);
const inPosY = op.inFloat("Y", 3);
const inPosZ = op.inFloat("Z", 5);

const positionIn = [inPosX, inPosY, inPosZ];
op.setPortGroup("Direction", positionIn);

const inR = op.inFloat("R", 1);
const inG = op.inFloat("G", 1);
const inB = op.inFloat("B", 1);

inR.setUiAttribs({ colorPick: true });
const colorIn = [inR, inG, inB];
op.setPortGroup("Color", colorIn);

const inSpecularR = op.inFloat("Specular R", 0.2);
const inSpecularG = op.inFloat("Specular G", 0.2);
const inSpecularB = op.inFloat("Specular B", 0.2);

inSpecularR.setUiAttribs({ colorPick: true });
const colorSpecularIn = [inSpecularR, inSpecularG, inSpecularB];
op.setPortGroup("Specular Color", colorSpecularIn);

const inIntensity = op.inFloat("Intensity", 1);
const attribIns = [inIntensity];
op.setPortGroup("Light Attributes", attribIns);

const inCastShadow = op.inBool("Cast Shadow", false);
const inShadowBias = op.inFloat("Bias", 0.002);
const inLRBT = op.inFloat("LR-BottomTop", 8);
const inNear = op.inFloat("Near", 0.1);
const inFar = op.inFloat("Far", 30);

op.setPortGroup("Shadow Attributes", [inShadowBias, inCastShadow, inLRBT, inNear, inFar]);

var inShadowBiasUniform = new CGL.Uniform(shader, "f", "inShadowBias", inShadowBias);

const outTrigger = op.outTrigger("Trigger Out");
const textureOut = op.outTexture("Shadow Map");

const light = new Light({
    type: "directional",
    position: [0, 1, 2].map(function(i){ return positionIn[i].get() }),
    color: [0 , 1, 2].map(function(i) { return colorIn[i].get() }),
    specular: [0 , 1, 2].map(function(i) { return colorSpecularIn[i].get() }),
    intensity: inIntensity.get(),
    radius: null,
    falloff: null,
});

inLRBT.onChange = inNear.onChange = inFar.onChange = function() {
    mat4.ortho(light.shadowInfo.projMatrix,
        -1*inLRBT.get(),
        inLRBT.get(),
        -1*inLRBT.get(),
        inLRBT.get(),
        inNear.get(),
        inFar.get());
}
const inLight = {
  position: [inPosX, inPosY, inPosZ],
  color: [inR, inG, inB],
  specular: [inSpecularR, inSpecularG, inSpecularB],
  intensity: inIntensity,
};

// * CHANGE HANDLERS
Object.keys(inLight).forEach(function(key) {
    if (inLight[key].length) {
        for (let i = 0; i < inLight[key].length; i += 1) {
            inLight[key][i].onChange = function() {
                light[key][i] = inLight[key][i].get();
            }
        }
    } else {
        inLight[key].onChange = function() {
            light[key] = inLight[key].get();
        }
    }
});

// * init vectors & matrices
const lookAt = vec3.create();
vec3.set(lookAt, 0, 0, 0);
const up = vec3.create();
vec3.set(up, 0, 1, 0);
const camPos = vec3.create();

const identityMat = mat4.create();
const biasMatrix = mat4.fromValues(
        0.5, 0.0, 0.0, 0.0,
        0.0, 0.5, 0.0, 0.0,
        0.0, 0.0, 0.5, 0.0,
        0.5, 0.5, 0.5, 1.0);
const lightBiasMVPMatrix = mat4.create();

function renderBlur(texture) {
    effect.setSourceTexture(texture);
    effect.startEffect();

    // render background color...
    cgl.setShader(blurShader);
    cgl.currentTextureEffect.bind();
    cgl.setTexture(12, cgl.currentTextureEffect.getCurrentSourceTexture().tex);
    cgl.currentTextureEffect.finish();
    cgl.setPreviousShader();

    //trigger.trigger();

    textureOut.set(effect.getCurrentSourceTexture());
    effect.endEffect();
}

function renderFramebuffer() {
    //cgl.frameStore.renderOffscreen = true;

    cgl.shadowPass = true;
    // * set shader

    cgl.setShader(shader);

    cgl.pushModelMatrix();
    cgl.pushViewMatrix();
    cgl.pushPMatrix();

    // fb.setSize(2048, 2048);
    fb.renderStart();

    // * calculate matrices & camPos vector
    vec3.set(camPos, light.position[0], light.position[1], light.position[2]);
    mat4.copy(cgl.mMatrix, identityMat); // M
    mat4.lookAt(cgl.vMatrix, camPos, lookAt, up); // V

    mat4.copy(cgl.pMatrix, light.shadowInfo.projMatrix); // P

    // * create light mvp bias matrix
    mat4.mul(lightBiasMVPMatrix, cgl.pMatrix, cgl.vMatrix);
    mat4.mul(lightBiasMVPMatrix, biasMatrix, lightBiasMVPMatrix);

    outTrigger.trigger();

    fb.renderEnd();

    // remove light from stack and readd it with shadow map & mvp matrix
    cgl.lightStack.pop();

    const map = fb.getTextureColor();

    light.mvpBiasMatrix = lightBiasMVPMatrix;

    if (light.shadowMapIndex === null) {
        cgl.shadowMapArray.push(map);
        const shadowMapIndex = cgl.shadowMapArray.indexOf(map);
        light.shadowMapIndex = shadowMapIndex;
    }
    else {
        cgl.shadowMapArray[light.shadowMapIndex] = map;
    }

    cgl.lightStack.push(light);

    cgl.popPMatrix();
    cgl.popModelMatrix();
    cgl.popViewMatrix();

    cgl.setPreviousShader();
    cgl.shadowPass = false;
    //cgl.frameStore.renderOffscreen = false;

}

const result = vec3.create();
const position = vec3.create();

inTrigger.onTriggered = function() {
    if (!cgl.lightStack) cgl.lightStack = [];
    if (!cgl.shadowMapArray) {
        cgl.shadowMapArray = [];
        // cgl.shadowMapArray.length = MAX_SHADOWMAPS;
     }
        /*
        if(op.patch.isEditorMode() && (CABLES.UI.renderHelper || gui.patch().isCurrentOp(op))) {
        CABLES.GL_MARKER.drawLineSourceDest({
            op: op,
            sourceX: -200*light.position[0],
            sourceY: -200*light.position[1],
            sourceZ: -200*light.position[2],
            destX: 200*light.position[0],
            destY: 200*light.position[1],
            destZ: 200*light.position[2],
        })
    }
    */


    cgl.lightStack.push(light);
    renderFramebuffer();
    outTrigger.trigger();
    cgl.lightStack.pop();

    textureOut.set(null);
    // textureOut.set(fb.getTextureColor());
}