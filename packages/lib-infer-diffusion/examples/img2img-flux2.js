'use strict'

const fs = require('bare-fs')
const path = require('bare-path')
const FilesystemDL = require('@qvac/dl-filesystem')
const ImgStableDiffusion = require('../index')

/**
 * FLUX2-klein img2img example
 * 
 * Transforms an input image using a text prompt.
 * This example uses FLUX2-klein-4B with Qwen3-4B text encoder.
 */

async function main () {
  const modelDir = path.join(__dirname, '../models')
  const inputImagePath = path.join(__dirname, '../temp/nik_headshot.jpeg')
  const outputImagePath = path.join(__dirname, '../temp/nik_transformed.png')

  // Check if input image exists
  if (!fs.existsSync(inputImagePath)) {
    console.error(`Error: Input image not found at ${inputImagePath}`)
    process.exit(1)
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

    const STEPS = 30        // effective denoising steps = floor(STEPS * STRENGTH)
    const STRENGTH = 0.5   // effective denoising steps = floor(STEPS * STRENGTH)

    console.log(`\nGenerating transformed image...`)
    console.log(`  Steps    : ${STEPS}  (effective denoising steps: ${Math.floor(STEPS * STRENGTH)})`)
    console.log(`  Strength : ${STRENGTH}`)
    console.log(`  Note     : VAE encode runs first (no progress tick) — please wait...\n`)

    const tGenStart = Date.now()
    let lastStepTime = tGenStart

    const response = await model.img2img({
      prompt: 'a european balkan male, wearing a suit, looking at the camera',
      negative_prompt: 'blurry, low quality, distorted',
      init_image: initImage,
      strength: STRENGTH,
      steps: STEPS,
      guidance: 7.0,
      seed: 42
    })

    await response
      .onUpdate((data) => {
        if (data instanceof Uint8Array) {
          const totalMs = Date.now() - tGenStart
          console.log(`\n✓ Image generated in ${(totalMs / 1000).toFixed(1)}s`)
          fs.writeFileSync(outputImagePath, data)
          console.log(`✓ Saved to: ${outputImagePath}`)
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
