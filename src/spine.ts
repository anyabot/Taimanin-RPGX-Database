// Animated (Spine) event CGs on the 1280x720 ADV stage. A port of the stage
// path of the local viewer's TaimaninSpinePlayer (D:\Download\Taimanin\
// taimanin_spine.js); the rules and the reasons for them are in HANDOFF.md
// "Spine behavior":
//  - runtime: the vendored, locally patched spine-webgl 3.6
//    (public/vendor/spine-3.6, see the TAIMANIN LOCAL PATCH note inside it)
//  - placement is authored: scale 0.75, skeleton origin at the stage centre;
//    never fitted to the animated extent
//  - event atlases are straight alpha (all 50 R18 event models), drawn on an
//    opaque black surface, with alpha blended (ONE, ONE_MINUS_SRC_ALPHA)
//  - a model ships skeleton variants X_01..X_05; an animation name ending in
//    _NN plays on variant NN
// The "_mosaic" atlas pages are mask textures for the game's censor shader and
// are deliberately not used.

declare global { interface Window { spine?: any } }

export const STAGE_W = 1280, STAGE_H = 720;
/** StorySpineEV.Init: localScale = kInitLocalScale (100) / _correctionScaleValue
 *  (1.333), times the SkeletonDataAsset scale 0.01. */
const EV_SCALE = 100 / 1.333 * 0.01;

let runtime: Promise<any> | null = null;
export function spineRuntime(): Promise<any> {
  return (runtime ??= new Promise((ok, fail) => {
    if (window.spine) return ok(window.spine);
    const s = document.createElement("script");
    s.src = `${import.meta.env.BASE_URL}vendor/spine-3.6/spine-webgl.js`;
    s.onload = () => (window.spine ? ok(window.spine) : fail(new Error("spine runtime did not load")));
    s.onerror = () => { runtime = null; fail(new Error("spine runtime failed to load")); };
    document.head.appendChild(s);
  }));
}

/** What a model's bundle provides, decoded. */
export interface SpineModel {
  name: string;
  atlas: string;
  /** variant ("01".."05") -> .skel bytes; "" is the model's primary skeleton */
  skels: Record<string, Uint8Array>;
  /** atlas page file name ("X_EV_01.png") -> pixels */
  pages: Record<string, ImageData>;
}

export const variantOf = (animation: string | null | undefined) => /_(\d{2})$/.exec(animation || "")?.[1] ?? null;

export class SpineStage {
  private gl: WebGLRenderingContext;
  private spine: any;
  private shader: any;
  private batcher: any;
  private renderer: any;
  private mvp: any;
  private textures: any[] = [];
  private skeleton: any = null;
  private state: any = null;
  private key = "";
  private frame = 0;
  private last = 0;
  private disposed = false;
  playing = true;

  constructor(spine: any, readonly canvas: HTMLCanvasElement) {
    this.spine = spine;
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;
    const gl = canvas.getContext("webgl", { alpha: false, premultipliedAlpha: true });
    if (!gl) throw new Error("WebGL is unavailable");
    this.gl = gl;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    // Spine 3.6's batcher only calls blendFunc, which would accumulate alpha
    // as As*As; keep colour factors, blend alpha as (ONE, ONE_MINUS_SRC_ALPHA).
    const blendFunc = gl.blendFunc.bind(gl);
    gl.blendFunc = (src: number, dst: number) => {
      if (gl.blendFuncSeparate) gl.blendFuncSeparate(src, dst, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else blendFunc(src, dst);
    };
    this.shader = spine.webgl.Shader.newTwoColoredTextured(gl);
    this.batcher = new spine.webgl.PolygonBatcher(gl);
    this.renderer = new spine.webgl.SkeletonRenderer(gl);
    this.mvp = new spine.webgl.Matrix4();
    // Spine 3.6's Skeleton has no scale of its own: scale the view instead,
    // with the skeleton origin at the stage centre.
    this.mvp.ortho2d(-STAGE_W / 2 / EV_SCALE, -STAGE_H / 2 / EV_SCALE, STAGE_W / EV_SCALE, STAGE_H / EV_SCALE);
    this.last = performance.now() / 1000;
    this.frame = requestAnimationFrame((t) => this.draw(t));
  }

  /** Show `model` playing `animation` (or its idle). Returns the animation played. */
  show(model: SpineModel, animation: string | null): string | null {
    const sp = this.spine;
    // spineVariantFor(): the skeleton whose _NN matches the animation's, else the primary
    const v = variantOf(animation);
    const variant = v && model.skels[v] ? v : "";
    const key = `${model.name}/${variant}`;
    if (key !== this.key) {
      this.textures.forEach((t) => t.dispose());
      this.textures = [];
      const atlas = new sp.TextureAtlas(model.atlas, (path: string) => {
        const img = model.pages[path];
        if (!img) throw new Error(`atlas page ${path} not in bundle`);
        const t = new sp.webgl.GLTexture(this.gl, img);
        this.textures.push(t);
        return t;
      });
      const data = new sp.SkeletonBinary(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData(model.skels[variant]);
      const skeleton = new sp.Skeleton(data);
      if (data.findSkin?.("default")) skeleton.setSkinByName("default");
      skeleton.x = skeleton.y = 0;
      skeleton.setToSetupPose();
      skeleton.updateWorldTransform();
      this.skeleton = skeleton;
      this.state = new sp.AnimationState(new sp.AnimationStateData(data));
      this.key = key;
    }
    const names: string[] = this.skeleton.data.animations.map((a: any) => a.name);
    const want = animation?.toLowerCase();
    const pick = names.find((n) => n.toLowerCase() === want)
      || names.find((n) => /idle|wait|stand|(^|_)wai(?:_|$)|(^|_)sle(?:_|$)/i.test(n))
      || names[0];
    const current = this.state.tracks?.[0]?.animation?.name;
    if (pick && pick !== current) {
      this.skeleton.setToSetupPose();
      this.state.setAnimation(0, pick, true);
    }
    return pick ?? null;
  }

  clear() {
    this.skeleton = null;
    this.state = null;
    this.key = "";
  }

  /** The current frame as a 2D canvas (WebGL clears its buffer after each
   *  frame, so it is drawn again here and copied in the same task). */
  snapshot(): HTMLCanvasElement {
    this.render(0);
    const c = document.createElement("canvas");
    c.width = STAGE_W;
    c.height = STAGE_H;
    c.getContext("2d")!.drawImage(this.canvas, 0, 0);
    return c;
  }

  private draw(timeMs: number) {
    if (this.disposed) return;
    this.frame = requestAnimationFrame((t) => this.draw(t));
    const now = timeMs / 1000;
    const delta = Math.min(0.1, Math.max(0, now - this.last));
    this.last = now;
    this.render(delta);
  }

  private render(delta: number) {
    const gl = this.gl;
    gl.viewport(0, 0, STAGE_W, STAGE_H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.skeleton || !this.state) return;
    if (this.playing) this.state.update(delta);
    this.state.apply(this.skeleton);
    this.skeleton.updateWorldTransform();
    const sp = this.spine;
    this.shader.bind();
    this.shader.setUniformi(sp.webgl.Shader.SAMPLER, 0);
    this.shader.setUniform4x4f(sp.webgl.Shader.MVP_MATRIX, this.mvp.values);
    this.batcher.begin(this.shader);
    this.renderer.premultipliedAlpha = false;
    this.renderer.draw(this.batcher, this.skeleton);
    this.batcher.end();
    this.shader.unbind();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.textures.forEach((t) => t.dispose());
    this.shader.dispose();
    this.batcher.dispose();
  }
}
