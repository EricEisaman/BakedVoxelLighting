import {cloudAt} from "./clouds.js";
import { DirectionalLight, DirectionalLightNode } from "three/webgpu";
import * as N from "three/tsl";
import { sampleVolume } from "./tsl-materials.js";
import { ref } from "./tsl-baking.js";
import { cloudDensity } from "./native-kernels.js";
export class VoxelSun extends DirectionalLight {}
export function installVoxelSun(renderer, uniforms) {
  class VoxelSunNode extends DirectionalLightNode {
    static get type() {
      return "VoxelSunNode";
    }
    setupDirect(builder) {
      const direct = super.setupDirect(builder);
      if (builder.material.userData.shading) {
        const visibility = sampleVolume(
          uniforms,
          "bakedAtlas",
          N.positionWorld.add(N.vec3(0, 1.2, 0)),
          [0.12, 0.16, 0.2, 1],
        ).a;
        direct.lightColor = direct.lightColor.mul(
          N.mix(1, visibility, ref(uniforms, "bakedEnabled")),
        );
      }
      direct.lightColor = direct.lightColor.mul(N.float(1).sub(cloudAt(uniforms,N.positionWorld,ref(uniforms,"liveSunDirection","vec3")).mul(.48)));
      return direct;
    }
  }
  renderer.library.addLight(VoxelSunNode, VoxelSun);
}
