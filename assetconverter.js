import yargs from "yargs"
import path from "path"
import fs from "fs"
import jschardet from "jschardet"
import iconv from "iconv-lite"

const argv = yargs.argv

const extensions = ["wav", "ogg"]

if(argv._.length < 1) {
  console.error("Specify input file.")
  process.exit()
}

const inputPath = path.resolve(argv._[0])
const inputDir = path.dirname(inputPath)
const outputDir = argv.o ? path.resolve(argv.o) : path.dirname(inputPath)
const fragSize = argv.s ? parseInt(argv.s) : 1048576 * 2
if(Number.isNaN(fragSize) || fragSize <= 0) {
  console.error("Fragment size must be > 0.")
  process.exit()
}

fs.readFile(inputPath, (err, data) => {
  if(err) throw err

  const charset = jschardet.detect(data)
  const bmson = JSON.parse(iconv.decode(data, charset.encoding))

  if(!bmson.version) {
    console.error("Legacy bmson isn't supported. Please upgrade the file.")
    process.exit()
  }

  //let currentFragment = new Buffer(fragSize)
  let currentFragmentStart = 0
  let currentFragmentIndex = 0
  let fragmentBuffers = [new Buffer(fragSize)]
  let reference = {}

  bmson.sound_channels.forEach((channel) => {
    const name = channel.name
    let fileName = name
    let success = false

    try {
      fs.accessSync(inputDir + "/" + fileName, fs.R_OK)
      success = true
    } catch(e) {
      const baseName = fileName.replace(/\.[^/.]+$/, "")
      for(let ext of extensions) {
        fileName = baseName + "." + ext
        try {
          fs.accessSync(inputDir + "/" + fileName, fs.R_OK)
          success = true
          break
        } catch(e) {
          continue
        }
      }
    }

    if(!success) {
      console.error(`In channel "${name}": File not found`)

      //process.exit()
    } else {
      const data = fs.readFileSync(inputDir + "/" + fileName)

      if(name != fileName) {
        console.log(`${name} -> ${fileName}: ${data.length}`)
      } else {
        console.log(`${name}: ${data.length}`)
      }

      let sourceSize = data.length
      let sourceRemainSize = data.length

      while(sourceRemainSize > 0) {
        if(currentFragmentStart == fragSize) {
          currentFragmentIndex ++
          fragmentBuffers[currentFragmentIndex] = new Buffer(fragSize)
          currentFragmentStart = 0
        }

        const sourceStart = sourceSize - sourceRemainSize
        let sourceEnd = sourceStart + fragSize
        if(sourceEnd > sourceSize) sourceEnd = sourceSize
        if(currentFragmentStart + sourceEnd - sourceStart > fragSize) sourceEnd = sourceStart + fragSize - currentFragmentStart

        data.copy(fragmentBuffers[currentFragmentIndex], currentFragmentStart, sourceStart, sourceEnd)

        sourceRemainSize -= sourceEnd - sourceStart

        console.log(`- [${sourceStart}, ${sourceEnd}) -> ${currentFragmentIndex}.crasset [${currentFragmentStart}, ${currentFragmentStart + sourceEnd - sourceStart})`)
        if(!reference[fileName]) {
          reference[fileName] = [[currentFragmentIndex, currentFragmentStart, currentFragmentStart + sourceEnd - sourceStart]]
        } else {
          reference[fileName].push([currentFragmentIndex, currentFragmentStart, currentFragmentStart + sourceEnd - sourceStart])
        }
        currentFragmentStart += sourceEnd - sourceStart
      }
    }
  })

  if(currentFragmentStart < fragSize) {
    console.log(`Trimming buffer`)
    const trimmedBuffer = new Buffer(currentFragmentStart)
    fragmentBuffers[currentFragmentIndex].copy(trimmedBuffer)
    fragmentBuffers[currentFragmentIndex] = trimmedBuffer
  }

  fragmentBuffers.forEach((buffer, index) => {
    console.log(`Saving ${index}.crasset`)
    fs.writeFileSync(`${outputDir}/${index}.crasset`, fragmentBuffers[index])
  })

  console.log(`Saving assets.json`)
  fs.writeFileSync(outputDir + "/assets.json", JSON.stringify(reference))

  console.log("Done.")
})
