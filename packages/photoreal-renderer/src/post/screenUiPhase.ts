// Grade the world into one display target, blend screen UI there, then copy.
// Direct ungraded canvas drawing selects a different MSAA attachment in Three.
// Cost includes this RGBA8 target, one copy draw and the backend canvas MSAA buffer.
import * as THREE from "three/webgpu";
import { screenUV, texture, workingToColorSpace } from "three/tsl";

interface ScreenUiComposition {
  display: THREE.RenderTarget;
  material: THREE.MeshBasicNodeMaterial;
  copy: THREE.QuadMesh;
}

interface ScreenUiDisplayStats {
  width: number;
  height: number;
  /** Single-sample by construction: the UI blends resolved, graded bytes. */
  samples: 0;
  /** Draw calls the phase adds beyond its members — the final copy. */
  copyDraws: 1;
}

export class ScreenUiPhase {
  /** No fog node, no environment, no lights: UI members shade themselves. */
  private readonly scene = new THREE.Scene();
  readonly colorSpace: string;
  private composition: ScreenUiComposition | null = null;
  private readonly drawingBuffer = new THREE.Vector2();
  private drawn = 0;

  constructor(private readonly renderer: THREE.WebGPURenderer) {
    this.scene.name = "photoreal-screen-ui";
    this.colorSpace = renderer.outputColorSpace;
  }

  add(member: THREE.Object3D): void {
    this.scene.add(member);
  }

  remove(member: THREE.Object3D): void {
    this.scene.remove(member);
  }

  /** Encode working-space UI color for direct display-space blending. */
  output(color: THREE.Node<"vec4">): THREE.Node<"vec4"> {
    // The cast re-types the untyped ColorSpaceNode return (@types/three drops
    // the node type); the node preserves alpha and only transforms rgb.
    return workingToColorSpace(color, this.colorSpace) as unknown as THREE.Node<"vec4">;
  }

  /** Hidden members keep their attachment so visibility changes do not churn
   *  Three's per-target caches. An empty phase submits only the world draw. */
  compose(camera: THREE.Camera, drawWorld: () => void): void {
    if (this.scene.children.length === 0) {
      this.drawn = 0;
      drawWorld();
      return;
    }
    const { renderer } = this;
    const { display, copy } = this.acquireComposition();
    const previousTarget = renderer.getRenderTarget();
    const previousOutput = renderer.getOutputRenderTarget();
    renderer.setOutputRenderTarget(display);
    try {
      drawWorld();
      this.drawMembers(camera);
    } finally {
      // Three leaves the graded output bound as its active render target.
      // Restore both selectors before sampling it in the final copy.
      renderer.setRenderTarget(previousTarget);
      renderer.setOutputRenderTarget(previousOutput);
    }
    this.withoutOutputTransform(() => copy.render(renderer));
  }

  private drawMembers(camera: THREE.Camera): void {
    this.drawn = this.scene.children.filter((member) => member.visible).length;
    if (this.drawn === 0) return;
    this.withoutOutputTransform(() => {
      const autoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      try {
        this.renderer.render(this.scene, camera);
      } finally {
        this.renderer.autoClear = autoClear;
      }
    });
  }

  private withoutOutputTransform(draw: () => void): void {
    const { renderer } = this;
    const toneMapping = renderer.toneMapping;
    const colorSpace = renderer.outputColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.ColorManagement.workingColorSpace;
    try {
      draw();
    } finally {
      renderer.toneMapping = toneMapping;
      renderer.outputColorSpace = colorSpace;
    }
  }

  private acquireComposition(): ScreenUiComposition {
    const { width, height } = this.renderer.getDrawingBufferSize(this.drawingBuffer);
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const existing = this.composition;
    if (existing !== null) {
      const { display } = existing;
      if (display.width !== w || display.height !== h) display.setSize(w, h);
      return existing;
    }
    // Store display-encoded bytes at canvas precision. NoColorSpace prevents
    // the final copy from decoding them; this attachment needs no depth.
    const display = new THREE.RenderTarget(w, h, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      samples: 0,
    });
    display.texture.name = "photoreal-screen-ui-display";
    const material = new THREE.MeshBasicNodeMaterial();
    material.fragmentNode = texture(display.texture, screenUV);
    material.depthTest = false;
    material.depthWrite = false;
    const copy = new THREE.QuadMesh(material);
    copy.name = "photoreal-screen-ui-display-copy";
    this.composition = { display, material, copy };
    return this.composition;
  }

  /** Release the owned attachment and its copy; members belong to their layers. */
  dispose(): void {
    this.composition?.display.dispose();
    this.composition?.material.dispose();
    this.composition = null;
  }

  stats() {
    return {
      owner: "screenUiPhase" as const,
      members: this.scene.children.length,
      drawn: this.drawn,
      toneMapped: false,
      depth: "none" as const,
      fog: "none" as const,
      colorSpace: this.colorSpace,
      display: this.displayStats(),
    };
  }

  private displayStats(): ScreenUiDisplayStats | null {
    if (this.composition === null) return null;
    const { display } = this.composition;
    return { width: display.width, height: display.height, samples: 0, copyDraws: 1 };
  }
}
