const inTex = op.inTexture("Texture");

op.setUiAttrib({ "height": 200, "width": 380, "resizable": true });

let pixelReader = new CGL.PixelReader();
let pixelData = null;
let lastWidth;
let lastHeight;
let fb;
let lastFloatingPoint;
let lastRead = 0;

const arr = [];

inTex.onLinkChanged = () =>
{
    op.setUiAttrib({ "extendTitle": "" });
};

op.renderVizLayer = (ctx, layer) =>
{
    const
        realTexture = inTex.get(),
        gl = op.patch.cgl.gl;

    ctx.fillStyle = "#222";
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);

    if (!realTexture) return;

    let lines = Math.floor(layer.height / layer.scale / 10 - 1);

    ctx.save();
    ctx.scale(layer.scale, layer.scale);

    ctx.font = "normal 10px sourceCodePro";
    ctx.fillStyle = "#ccc";

    if (!fb) fb = gl.createFramebuffer();

    let channels = gl.RGBA;
    let numChannels = 4;

    let texChanged = true;
    let channelType = gl.UNSIGNED_BYTE;

    if (texChanged)
    {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, realTexture.tex, 0
        );

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        let isFloatingPoint = realTexture.isFloatingPoint();
        if (isFloatingPoint) channelType = gl.FLOAT;

        if (
            lastFloatingPoint != isFloatingPoint ||
                    lastWidth != realTexture.width ||
                    lastHeight != realTexture.height)
        {
            const size = realTexture.width * realTexture.height * numChannels;
            if (isFloatingPoint) pixelData = new Float32Array(size);
            else pixelData = new Uint8Array(size);

            lastFloatingPoint = isFloatingPoint;
            lastWidth = realTexture.width;
            lastHeight = realTexture.height;
        }

        texChanged = false;
    }

    let texRows = Math.max(1, Math.ceil(lines / realTexture.width));
    texRows = Math.min(texRows, realTexture.height);
    let readW = realTexture.width;
    if (lines / realTexture.width < 1)readW = realTexture.width * lines / realTexture.width;
    const readH = texRows;
    let readPixels = false;

    if (performance.now() - lastRead >= 50)readPixels = true;

    if (readPixels)
    {
        lastRead = performance.now();

        if (!texChanged)
            pixelReader.read(op.patch.cgl, fb, realTexture.textureType, 0, realTexture.height - texRows, readW, readH,
                (pixel) =>
                {
                    pixelData = pixel;
                });
        // gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

        // gl.readPixels(
        //     0,
        //     realTexture.height - texRows,
        //     readW,
        //     readH,
        //     channels,
        //     channelType,
        //     pixelData
        // );

        // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    arr.length = pixelData.length;
    let stride = 4;
    let padding = 4;
    let lineHeight = 10;
    let isFp = realTexture.isFloatingPoint();

    for (let x = 0; x < readW; x++)
        for (let y = 0; y < readH; y++)
            for (let s = 0; s < stride; s++)
                arr[(x + (y * readW)) * stride + s] = pixelData[((x) + ((readH - y - 1) * readW)) * stride + s];

    if (realTexture && realTexture.getInfoOneLine)
        op.setUiAttrib({ "extendTitle": inTex.links[0].getOtherPort(inTex).name + ": " + realTexture.getInfoOneLine() });

    for (let y = 0; y < readH; y++)
        for (let x = 0; x < readW; x++)
        {
            const count = x + y * readW;

            const i = x * stride + (y * readW * stride);

            ctx.fillStyle = "#666";

            ctx.fillText(i / stride,
                layer.x / layer.scale + padding,
                layer.y / layer.scale + lineHeight + i / stride * lineHeight + padding);

            const idx = count * stride;

            if (inTex.get().isFloatingPoint()) ctx.fillStyle = "rgba(" + arr[idx + 0] * 255 + "," + arr[idx + 1] * 255 + "," + arr[idx + 2] * 255 + "," + arr[idx + 3] * 255 + ")";
            else ctx.fillStyle = "rgba(" + arr[idx + 0] + "," + arr[idx + 1] + "," + arr[idx + 2] + "," + arr[idx + 3] + ")";

            ctx.fillRect(
                layer.x / layer.scale + padding + 25,
                layer.y / layer.scale + lineHeight + count * lineHeight + padding - 7,
                15, 8);

            ctx.fillStyle = "#ccc";

            for (let s = 0; s < stride; s++)
            {
                let v = arr[i + s];
                let str = "" + v;

                if (!isFp)v /= 255;
                str = String(Math.round(v * 10000) / 10000);

                ctx.fillText(str, layer.x / layer.scale + s * 60 + 70, layer.y / layer.scale + 10 + (i / stride) * 10 + padding);
            }
        }

    const gradHeight = 30;

    if (lines < readH * readW)
    {
        const radGrad = ctx.createLinearGradient(0, layer.y / layer.scale + layer.height / layer.scale - gradHeight + 5, 0, layer.y / layer.scale + layer.height / layer.scale - gradHeight + gradHeight);
        radGrad.addColorStop(1, "#222");
        radGrad.addColorStop(0, "rgba(34,34,34,0.0)");
        ctx.fillStyle = radGrad;
        ctx.fillRect(layer.x / layer.scale, layer.y / layer.scale + layer.height / layer.scale - gradHeight, 200000, gradHeight);
    }

    ctx.restore();
};
