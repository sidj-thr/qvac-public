'use strict'

const fs = require('bare-fs')
const path = require('bare-path')
const FilesystemDL = require('@qvac/dl-filesystem')
const ImgStableDiffusion = require('../index')

/**
 * FLUX2-klein img2img example
 *
 * Transforms an input image using a text prompt via in-context conditioning.
 * The model attends to the input image through joint attention, preserving
 * features like skin tone and structure while generating a new image.
 */

async function main () {
  const modelDir = path.join(__dirname, '../models')
  const inputImagePath = path.join(__dirname, '../assets/von-neumann.jpg')
  const outputImagePath = path.join(__dirname, '../temp/von-neumann_transformed.png')

  if (!fs.existsSync(inputImagePath)) {
    console.error(`Error: Input image not found at ${inputImagePath}`)
    return
  }

  console.log('Loading FLUX2-klein model...')

  const loader = new FilesystemDL({ dirPath: modelDir })

  const model = new ImgStableDiffusion(
    {
      loader,
      logger: console,
      diskPath: modelDir,
      modelName: 'flux-2-klein-4b-Q8_0.gguf',
      llmModel: 'Qwen3-4B-Q4_K_M.gguf',
      vaeModel: 'flux2-vae.safetensors'
    },
    {
      threads: 4,
      device: 'gpu', // or 'cpu' for MacBook Air
      prediction: 'flux2_flow'
    }
  )

  try {
    // Load model weights
    await model.load()
    console.log('Model loaded!')

    // Read input image
    const initImage = fs.readFileSync(inputImagePath)
    console.log(`Input image: ${initImage.length} bytes`)

    const STEPS = 20
    const GUIDANCE = 3.5
    const SEED = 42

    console.log('\n=== FLUX2-klein img2img ===')
    console.log('  Model    : flux-2-klein-4b-Q8_0.gguf')
    console.log('  Steps    : ' + STEPS)
    console.log('  Guidance : ' + GUIDANCE)
    console.log('  Seed     : ' + SEED)
    console.log('  Note     : VAE encode runs first (no progress tick) — please wait...\n')

    const tGenStart = Date.now()
    let lastStepTime = tGenStart

    const response = await model.run({
      prompt: 'same person, color photograph, modern tech CEO of this version, wearing a gray zip up vest, black studio background',
      negative_prompt: 'blurry, low quality, NSFW, distorted, different person, different face',
      init_image: initImage,
      cfg_scale: 1.0,
      steps: STEPS,
      guidance: GUIDANCE,
      seed: SEED
    })

    await response
      .onUpdate((data) => {
        if (data instanceof Uint8Array) {
          const totalMs = Date.now() - tGenStart
          console.log(`\n✓ Image generated in ${(totalMs / 1000).toFixed(1)}s`)
          fs.writeFileSync(outputImagePath, data)
          console.log(`✓ Saved to: ${outputImagePath}`)
          console.log('\nFor comparison, run the F16 version:')
          console.log('  bare examples/img2img-flux2-f16.js')
        } else if (typeof data === 'string') {
          try {
            const tick = JSON.parse(data)
            if ('step' in tick && 'total' in tick) {
              const now = Date.now()
              const stepMs = now - lastStepTime
              lastStepTime = now
              const wallMs = now - tGenStart
              process.stdout.write(
                `\r  step ${tick.step}/${tick.total} | step took ${(stepMs / 1000).toFixed(1)}s | wall ${(wallMs / 1000).toFixed(1)}s elapsed  `
              )
            }
          } catch (_) {}
        }
      })
      .await()

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await model.unload()
    await loader.close()
  }
}

main()
