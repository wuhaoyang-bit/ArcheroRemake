import type {WebGPURenderer} from 'three/webgpu';
/** Initialization only: ensure warmup uploads/draws finish before removing the loading overlay. */
export async function finishGpuWarmup(renderer:WebGPURenderer){
 // Three r186 removed Renderer.waitForGPU(); use the WebGPU submission queue.
 const backend=renderer.backend as unknown as {device?:{queue:{onSubmittedWorkDone():Promise<void>}}};
 if(backend.device)await backend.device.queue.onSubmittedWorkDone();
}
