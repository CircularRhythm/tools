import yargs from "yargs"
import path from "path"
import fs from "fs"
import jschardet from "jschardet"
import iconv from "iconv-lite"
import prompt from "prompt-sync"

prompt.init()

const argv = yargs
  .usage("Usage: $0 <basedir> <command> [files or directories relative to basedir]")
  .demand(2)
  .command("add", "Add music(s)")
  .command("remove", "Remove music(s)")
  .command("list", "List music(s)")
  .command("arrange", "Arrange music(s)")
  .argv

const modeString = {single: "Single", double: "Double"}

function promptYesNo(message, defaultValue) {
  let result = null
  while(result != "y" && result != "n") {
    process.stdout.write(message)
    result = prompt.prompt().toLowerCase()
    if(result == "") result = defaultValue
  }
  if(result == "y") return true
  return false
}

function loadBaseDir(baseDir, create) {
  try {
    const musicListFile = fs.readFileSync(path.join(baseDir, "music.json"))
    return JSON.parse(musicListFile)
  } catch(e) {
    if(create) {
      if(promptYesNo("music.json not found or invalid, Create new? (Y/n)", "y")) {
        return []
      } else {
        process.exit()
      }
    } else {
      console.error("music.json not found.")
      process.exit()
    }
  }
}

function addEntry(musicList, baseDir, parentDir, bmsonPaths) {
  const entry = {
    title: null,
    genre: null,
    artist: null,
    basedir: parentDir,
    packed_assets: null,
    charts: {single: [], double: []}
  }
  entry.packed_assets = promptYesNo("Packed assets? (Y/n)", "y")
  bmsonPaths.forEach((filePath, i) => {
    addChart(entry, path.join(baseDir, parentDir), filePath, i == 0)
  })
  musicList.push(entry)
}

function addChart(entry, dirPath, filePath, overwriteInfo) {
  const bmsonFullPath = path.join(dirPath, filePath)
  const data = fs.readFileSync(bmsonFullPath)
  const charset = jschardet.detect(data)
  const bmson = JSON.parse(iconv.decode(data, charset.encoding))

  if(!bmson.version) {
    console.error("Legacy bmson isn't supported. Please upgrade the file.")
    return
  }

  let mode
  if(bmson.info.mode_hint == "circularrhythm-single") {
    mode = "single"
  } else if(bmson.info.mode_hint == "circularrhythm-double") {
    mode = "double"
  } else {
    console.error("Unsupported mode hint: " + bmson.info.mode_hint)
    return
  }

  if(overwriteInfo) {
    entry.title = bmson.info.title
    entry.subtitle = bmson.info.subtitle || ""
    entry.artist = bmson.info.artist
    entry.subartists = bmson.info.subartists || []
    entry.genre = bmson.info.genre
    entry.banner_image = bmson.info.banner_image || null
    entry.preview_music = bmson.info.preview_music || null
    console.log(`Set music info from ${filePath}:`)
    console.log(`  title: ${entry.title}`)
    console.log(`  subtitle: ${entry.subtitle}`)
    console.log(`  artist: ${entry.artist}`)
    console.log(`  subartists: ${entry.subartists.join(",")}`)
    console.log(`  genre: ${entry.genre}`)
    console.log(`  banner_image: ${entry.banner_image}`)
    console.log(`  preview_music: ${entry.preview_music}`)
  }

  const bpmList = bmson.bpm_events.map((e) => e.bpm).concat(bmson.info.init_bpm)

  const chart = {}
  chart.file = filePath
  /*chart.title = bmson.info.title
  chart.subtitle = bmson.info.subtitle || ""
  chart.artist = bmson.info.artist
  chart.subartists = bmson.info.subartists || []
  chart.genre = bmson.info.genre*/
  chart.chart_name = bmson.info.chart_name
  chart.level = bmson.info.level
  chart.bpm = {
    initial: bmson.info.init_bpm,
    min: Math.min(...bpmList),
    max: Math.max(...bpmList)
  }

  console.log(`Added ${filePath}: ${modeString[mode]} ${chart.chart_name} Level ${chart.level}`)

  entry.charts[mode].push(chart)
}

function infoEntry(entry) {
  console.log(`  title: ${entry.title}`)
  console.log(`  subtitle: ${entry.subtitle}`)
  console.log(`  artist: ${entry.artist}`)
  console.log(`  subartists: ${entry.subartists.join(",")}`)
  console.log(`  genre: ${entry.genre}`)
  console.log(`  banner_image: ${entry.banner_image}`)
  console.log(`  preview_music: ${entry.preview_music}`)
  console.log(`  basedir: ${entry.basedir}`)
  console.log(`  packed_assets: ${entry.packed_assets}`)
  console.log("  Single charts:")
  entry.charts.single.forEach((e) => {
    console.log(`    ${e.file}: ${e.chart_name} Level ${e.level}`)
  })
  console.log("  Double charts:")
  entry.charts.double.forEach((e) => {
    console.log(`    ${e.file}: ${e.chart_name} Level ${e.level}`)
  })
}

function infoChart(chart, type) {
  console.log(`  type: ${type}`)
  console.log(`  title: ${chart.title}`)
  console.log(`  genre: ${chart.genre}`)
  console.log(`  artist: ${chart.artist}`)
  console.log(`  bpm: ${chart.bpm}`)
  console.log(`  level: ${chart.level}`)
}

const [baseDir, command, ...files] = argv._
const resolvedBaseDir = path.resolve(baseDir)

let musicList = null
switch(command) {
  case "add":
    if(files.length == 0) {
      console.error("No target.")
      process.exit()
    }

    musicList = loadBaseDir(resolvedBaseDir, true)

    files.forEach((syntax) => {
      // syntax: "basedir:path/to/bmson"
      const split = syntax.split(":")
      if(split.length >= 2) {
        // add chart
        const [dirName, bmsonName] = split
        const bmsonFullPath = path.join(baseDir, dirName, bmsonName)
        try {
          const entry = musicList.find((e) => e.basedir == dirName)
          if(entry) {
            const single = entry.charts.single.find((e) => e.file == bmsonName)
            const double = entry.charts.double.find((e) => e.file == bmsonName)
            if(single || double) {
              if(promptYesNo("Chart already found in music.json, overwrite? (y/N)", "n")) {
                entry.charts.single = entry.charts.single.filter((e) => e.file != bmsonName)
                entry.charts.double = entry.charts.double.filter((e) => e.file != bmsonName)
                addChart(entry, path.join(baseDir, dirName), bmsonName, false)
              } else {
                console.log("Skipping.")
              }
            } else {
              addChart(entry, path.join(baseDir, dirName), bmsonName, false)
            }
          } else {
            addEntry(musicList, baseDir, dirName, [bmsonName])
          }
        } catch(e) {
          throw e
          console.error(`Load failed ${bmsonFullPath} (${e.message})`)
        }
      } else {
        // add music folder
        const dirName = split[0]
        const fullPath = path.join(resolvedBaseDir, dirName)
        // TODO: traverse?
        try {
          const foundBmson = []
          const dir = fs.readdirSync(fullPath)
          dir.forEach((filePath) => {
            if(filePath.search(/\.bmson$/) >= 0) {
              foundBmson.push(filePath)
              console.log(`Found ${syntax}:${filePath}`)
            }
          })
          if(foundBmson.length > 0) {
            console.log(`${foundBmson.length} bmson found`)
            if(musicList.find((e) => e.basedir == syntax)) {
              if(promptYesNo("Entry already found in music.json, overwrite? (y/N)", "n")) {
                musicList = musicList.filter((e) => e.basedir != syntax)
                addEntry(musicList, baseDir, dirName, foundBmson)
              } else {
                console.log("Skipping.")
              }
            } else {
              addEntry(musicList, baseDir, dirName, foundBmson)
            }
          } else {
            console.log("No bmson found")
          }
        } catch(e) {
          console.error(`Load failed ${fullPath} (${e.message})`)
        }
      }
      console.log("Updating music.json")
      fs.writeFileSync(path.join(baseDir, "music.json"), JSON.stringify(musicList, null, "  "))
      console.log("Done.")
    })

  break

  case "remove":
    if(files.length == 0) {
      console.error("No target.")
      process.exit()
    }

    musicList = loadBaseDir(path.resolve(baseDir), false)

    files.forEach((syntax) => {
      // syntax: "basedir:path/to/bmson"
      const split = syntax.split(":")
      if(split.length >= 2) {
        // remove chart
        const [dirName, bmsonName] = split
        if(promptYesNo(`Do you really want to remove ${syntax} ? (Y/n)`, "y")) {
          const music = musicList.find((e) => e.basedir == dirName)
          if(music) {
            music.charts.single = music.charts.single.filter((e) => e.file != bmsonName)
            music.charts.double = music.charts.double.filter((e) => e.file != bmsonName)
            console.log(`Removed ${syntax}`)
          } else {
            console.error(`No entry: ${syntax}`)
          }
        } else {
          console.log("Skipping.")
        }
      } else {
        // remove music
        const dirName = split[0]
        if(promptYesNo(`Do you really want to remove ${syntax} ? (Y/n)`, "y")) {
          if(musicList.filter((e) => e.basedir == dirName).length > 0) {
            musicList = musicList.filter((e) => e.basedir != dirName)
            console.log(`Removed ${syntax}`)
          } else {
            console.error(`No entry: ${syntax}`)
          }
        } else {
          console.log("Skipping.")
        }
      }
    })
    console.log("Updating music.json")
    fs.writeFileSync(path.join(baseDir, "music.json"), JSON.stringify(musicList, null, "  "))
    console.log("Done.")
  break

  case "list":
    musicList = loadBaseDir(resolvedBaseDir, false)
    // TODO: Input file/directory
    if(files.length > 0) {
      files.forEach((syntax) => {
        // syntax: "basedir:path/to/bmson"
        const split = syntax.split(":")
        if(split.length >= 2) {
          const [dirName, bmsonName] = split
          const entry = musicList.find((e) => e.basedir == dirName)
          if(entry) {
            entry.charts.single.filter((e) => e.file == bmsonName).forEach((e) => {
              console.log(`${syntax}:`)
              infoChart(e, "single")
            })
            entry.charts.double.filter((e) => e.file == bmsonName).forEach((e) => {
              console.log(`${syntax}:`)
              infoChart(e, "double")
            })
          } else {
            console.error(`No entry: ${syntax}`)
          }
        } else {
          const dirName = split[0]
          const entry = musicList.find((e) => e.basedir == dirName)
          if(entry) {
            console.log(`${syntax}:`)
            infoEntry(entry)
          } else {
            console.error(`No entry: ${syntax}`)
          }
        }
      })
    } else {
      musicList.forEach((music) => {
        console.log(`${music.basedir}: ${music.title}`)
      })
    }
  break

  case "arrange":
    console.log("Not supported yet")
    // TODO
  break

  default:
    console.error("Invalid command: " + command)
    yargs.showHelp()
    process.exit()
}
