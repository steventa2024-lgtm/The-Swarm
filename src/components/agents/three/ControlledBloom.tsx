import { Bloom, EffectComposer } from '@react-three/postprocessing'
/** Only large High/Cinematic scenes pay for bloom; compact shared views use emissive materials. */
export default function ControlledBloom() {
  return <EffectComposer multisampling={0}><Bloom mipmapBlur intensity={0.32} luminanceThreshold={1.2} luminanceSmoothing={0.2} /></EffectComposer>
}
