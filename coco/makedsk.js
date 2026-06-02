/**
 * Create a CoCo Disk BASIC / RS-DOS .DSK image from host files.
 * Usage: node MAKE_DSK.js SPACE18.DSK BARS18.BIN:bin SPACE18.BIN:bin START.BAS:ascii BARS.BAS:ascii
 */
const TRACKS = 35
, SECTORS_PER_TRACK = 18
, SECTOR_SIZE = 256
, DISK_SIZE = TRACKS * SECTORS_PER_TRACK * SECTOR_SIZE
, DIR_TRACK = 17
, FAT_SECTOR_INDEX = DIR_TRACK * SECTORS_PER_TRACK + 1 // track 17, sector 2
, DIR_START_SECTOR_INDEX = DIR_TRACK * SECTORS_PER_TRACK + 2 // track 17, sector 3
, DIR_SECTORS = 9
, GRANULES = 68
, SECTORS_PER_GRANULE = 9

function sectorOffset(sectorIndex) { return sectorIndex * SECTOR_SIZE }

function granuleToSectorIndex(granule) {
    if (granule < 0 || granule >= GRANULES)
        throw new Error(`Bad granule: ${granule}`)
    let track = Math.floor(granule / 2)
    if (track >= DIR_TRACK) track += 1
    const half = granule % 2
    return track * SECTORS_PER_TRACK + half * SECTORS_PER_GRANULE
}

function cocoName(filePath) {
    //const parsed = path.parse(filePath)
    const parsed = filePath.split('.')  
    let stem = parsed[0].toUpperCase().slice(0, 8)
    , ext = parsed[1].replace('.', '').toUpperCase().slice(0, 3)
    if (!stem) throw new Error(`Bad filename: ${filePath}`)
    stem = stem.padEnd(8, ' ') // Pad out with spaces to fit 8.3 spec
    ext = ext.padEnd(3, ' ')

    return { nameBuf:  encStr(stem), extBuf: encStr(ext) }
}

function makeDsk(entries) {
    let disk = new Uint8Array(DISK_SIZE).fill(0xFF) //35 * 18 * 256) // Initialize empty disk image filled with 0xFF
    // Clear FAT and directory sectors to zero baseline
    disk.fill(0x00, sectorOffset(FAT_SECTOR_INDEX), sectorOffset(FAT_SECTOR_INDEX) + SECTOR_SIZE)
    disk.fill(0x00, sectorOffset(DIR_START_SECTOR_INDEX), sectorOffset(DIR_START_SECTOR_INDEX + DIR_SECTORS))
    const fat = new Uint8Array(256) // Defaults to 0x00
    const dirBytes =  new Uint8Array(DIR_SECTORS * SECTOR_SIZE).fill(0x00)
    let nextGranule = 0
    for (let fileIndex = 0; fileIndex < entries.length; fileIndex++) {
        let file = entries[fileIndex], data = file.buf
        /*
        const mode = file.type == 2 ? 'bin' : 'ascii'
        if (mode === 'ascii' || mode === 'basic') {
            // Normalize line endings to CoCo CR (0x0D) format
            let text = decStr(data)
            text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
            if (text.endsWith('\n')) text = text.slice(0, -1)  
            console.log("text:", text.length, text, data)
            data = encStr(text.split('\n').join('\r') + '\r')
        }*/

        const sectorsNeeded = Math.max(1, Math.ceil(data.length / SECTOR_SIZE))
            , granulesNeeded = Math.ceil(sectorsNeeded / SECTORS_PER_GRANULE)
            , granules = []
        if (nextGranule + granulesNeeded > GRANULES) throw new Error("Disk image is full")
        for (let g = nextGranule; g < nextGranule + granulesNeeded; g++) granules.push(g)
        nextGranule += granulesNeeded
        let pos = 0  // Write file data granule by granule
        for (const g of granules) {
            const startSector = granuleToSectorIndex(g)
            for (let s = 0; s < SECTORS_PER_GRANULE; s++) {
                if (pos >= data.length) break             
                const chunk =  new Uint8Array(SECTOR_SIZE).fill(0x00)
                chunk.set(data.subarray(pos, pos + SECTOR_SIZE), 0)
             
                const off = sectorOffset(startSector + s)
                disk.set(chunk, off)
                pos += SECTOR_SIZE
            }
        }
        let remainingSectors = sectorsNeeded // Link FAT granules
        for (let idx = 0; idx < granules.length; idx++) {
            const g = granules[idx]
            if (idx < granules.length - 1) {
                fat[g] = granules[idx + 1]
                remainingSectors -= SECTORS_PER_GRANULE
            } else
                fat[g] = 0xC0 + Math.max(1, remainingSectors)
        }
        // Write Directory Entry
        const { nameBuf, extBuf } = cocoName(file.name + '.' + file.ext), de = fileIndex * 32       
        dirBytes.set(nameBuf, de)
        dirBytes.set(extBuf, de + 8)
        /*
        let fileType, asciiFlag
        if (mode === 'bin') {
             fileType = 0x02   // Machine language program
            asciiFlag = 0x00  // Binary
        } else {
            fileType = 0x00   // BASIC program/data text
            asciiFlag = 0xFF  // ASCII
        */
        dirBytes[de + 11] = file.type
        dirBytes[de + 12] = file.ascii
        dirBytes[de + 13] = granules[0]
        let lastCount = data.length % SECTOR_SIZE
        if (lastCount === 0) lastCount = SECTOR_SIZE
        dirBytes[de + 14] = (lastCount >> 8) & 0xFF
        dirBytes[de + 15] = lastCount & 0xFF
    }
    // Fill remaining valid granules as FREE (0xFF)
    for (let g = nextGranule; g < GRANULES; g++)
        fat[g] = 0xFF
    // Write internal structures back into disk buffer
    disk.set(fat, sectorOffset(FAT_SECTOR_INDEX))   
    disk.set(dirBytes, sectorOffset(DIR_START_SECTOR_INDEX))
    console.log(`Created disk image with ${entries.length} file(s), ${disk.length} bytes.`)
    return disk
}
