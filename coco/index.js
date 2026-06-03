        (async function() {

            const Audio = document.getElementById("Audio")
            , fileInput = document.getElementById("file-input")
            , btnSaveWav = document.getElementById("btnSaveWav")
            , btnSaveCas = document.getElementById("btnSaveCas")
            , btnSaveDsk = document.getElementById("btnSaveDsk")
            , selZFiles = document.getElementById("selZFiles")
            , selDFiles = document.getElementById("selDFiles")
            , selVDisk = document.getElementById("selVDisk")
            , FileCS = document.getElementById("FileCS")
            , CasCS = document.getElementById("CasCS")
            , WavCS = document.getElementById("WavCS")
            , taBas = document.getElementById("taBas")
            , dvDskInfo = document.getElementById("dvDskInfo")
            btnSaveWav.onclick = Download
            btnSaveCas.onclick = Download
            btnSaveDsk.onclick = Download
            fileInput.onchange = readZipFiles //readFile
            selZFiles.ondblclick = selZFilesOnChange
            selDFiles.ondblclick = selDFilesOnChange
            selVDisk.ondblclick = selVFilesRemove
            
            let zentries, dir, dskbuf, cas, cocoCasWave, vDskEntries = []

            document.getElementById('filterInput').addEventListener('input', function (e) {
                // Convert input text to lowercase for case-insensitive matching
                const filterValue = e.target.value.toLowerCase()
                const selectList = selZFiles
                const options = selectList.options

                // Loop through all options in the dropdown list
                for (let i = 0; i < options.length; i++) {
                    const optionText = options[i].text.toLowerCase()
                    // If the option text includes the filter string, show it; otherwise, hide it
                    if (optionText.includes(filterValue)) {
                        options[i].style.display = ""
                    } else {
                        options[i].style.display = "none"
                    }
                }
            })

            async function readFile(f) {
                const arrayBuffer = await f.arrayBuffer()
                FileCS.innerText = await SHAbuf(arrayBuffer)

                console.log("readFile:", f)
                
                if(f.name.toLowerCase().endsWith(".dsk")){
                    return listDskFiles(arrayBuffer)
                    //cocoCasWave = createAudioCoCo(convertDatatoCas(arrayBuffer))
                }else
                if(f.name.toLowerCase().endsWith(".p"))
                    cocoCasWave = createAudioZX81(arrayBuffer)
                else
                    cocoCasWave = createAudioCoCo(arrayBuffer)
                
                Audio.src = URL.createObjectURL(new Blob([cocoCasWave], { type: 'audio/wav' }))
                WavCS.innerText = await SHAbuf(cocoCasWave)
            }
        
            async function SHAbuf(arrayBuffer, alg=1){
                const hashBuffer = await crypto.subtle.digest(`SHA-${alg}`, arrayBuffer)
                const hashArray = Array.from(new Uint8Array(hashBuffer))
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
            }
            //for unzipit
            async function readZipFiles() {
                const f = fileInput.files[0]
                const arrayBuffer = await f.arrayBuffer()
                FileCS.innerText =  await SHAbuf(arrayBuffer)
                CasCS.innerText =  ""
                WavCS.innerText =  ""
                grpDFiles.style.display = "none"
        
                if(f.name.toLowerCase().endsWith(".zip")){
                    grpZFiles.style.display = "block"
                    const {entries} = await unzipit.unzip(f)
                    zentries = entries
                    selZFiles.options.length = 0
                    for (const [name, entry] of Object.entries(zentries)) {
                        var opt = document.createElement('option')
                        opt.value = name
                        opt.innerHTML = `${name} bytes: ${entry.size}`
                        selZFiles.appendChild(opt)
                    }
                } else{
                    grpZFiles.style.display = "none"
                    selZFiles.options.length = 0
                    await readFile(f)
                }
            }
        
            async function selZFilesOnChange() {
                grpDFiles.style.display = "none"
                const arrayBuffer =  new Uint8Array(await zentries[selZFiles.value].arrayBuffer())
                CasCS.innerText = await SHAbuf(arrayBuffer)

                if(selZFiles.value.toLowerCase().endsWith(".dsk")){
                    return listDskFiles(arrayBuffer)
                    //cocoCasWave = createAudioCoCo(convertDatatoCas(arrayBuffer))
                }else
                if(selZFiles.value.toLowerCase().endsWith(".p"))
                    cocoCasWave = createAudioZX81(arrayBuffer)
                else
                    cocoCasWave = createAudioCoCo(arrayBuffer)
        
                Audio.src = URL.createObjectURL(new Blob([cocoCasWave], { type: 'audio/wav' }))
                WavCS.innerText = await SHAbuf(cocoCasWave)
            }

            async function selDFilesOnChange() {
                console.log("selDFilesOnChange", selZFiles.value, selDFiles.value)

                //console.log("selDFilesOnChange ze:", dir, zentries)
                const selDFile = dir.find( f => `${f.name}.${f.ext}` === selDFiles.value )
                const zfbuf =  dskbuf//new Uint8Array(await zentries[selZFiles.value].arrayBuffer())
                const ext = selDFile.ext
                //if(ext == "BAS" || ext == "TXT" || ext == "DOC"){
                    //console.log("bas:", selDFiles.value, zfbuf.length, selDFile, ext)
                    const dd = getDskFileData(zfbuf, selDFile)
                    vDskEntries.push({...selDFile, buf: dd })
                    listVDskFiles()
                    console.log("vDskEntries:", vDskEntries)
                    taBas.value = ext === "BAS" ? basDeTok(dd) : decStr(dd)
                //}

                console.log("selDFile:", dir, selDFile)
                cas = convertDatatoCas(zfbuf, selDFile.i)
                CasCS.innerText = await SHAbuf(cas)

                cocoCasWave = createAudioCoCo(cas)
                Audio.src = URL.createObjectURL(new Blob([cocoCasWave], { type: 'audio/wav' }))
                WavCS.innerText = await SHAbuf(cocoCasWave)
            }

            function listDskFiles(d){
                selDFiles.options.length = 0
                grpDFiles.style.display = "block"

                dskbuf = new Uint8Array(d)
                dir = getDirectory(dskbuf)
                for (const e of dir) {
                    var opt = document.createElement('option')
                    opt.value = `${e.name}.${e.ext}`
                    opt.innerHTML = `${opt.value} bytes: ${e.size} grans: ${e.grans.length-1} ascii: ${e.ascii} type: ${e.type}`
                    selDFiles.appendChild(opt)
                }
            }

            function listVDskFiles(){
                if(vDskEntries.length === 0){
                    grpVDisk.style.display = "none"
                    dvDskInfo.innerText = `Granules: 0 Files: 0 Free: ${GRANULES}`
                    return
                }
                selVDisk.options.length = 0
                grpVDisk.style.display = "block"
                let totalGrans = 0
                for (const e of vDskEntries) {
                    var opt = document.createElement('option')
                    opt.value = `${e.name}.${e.ext}` 
                    opt.innerHTML = `${opt.value} bytes: ${e.size} grans: ${e.grans.length-1} ascii: ${e.ascii} type: ${e.type}`
                    selVDisk.appendChild(opt)
                    totalGrans += e.grans.length -1
                }

                dvDskInfo.innerText = `Granules: ${totalGrans} Files: ${vDskEntries.length} Free: ${GRANULES - totalGrans}`
            }

            function selVFilesRemove() {
                vDskEntries.splice(selVDisk.selectedIndex, 1)
                listVDskFiles()
            }

            function Download(e) {               
                var saveByteArray = (function () {
                var a = document.createElement("a")
                a.style = 'display: none'
                document.body.appendChild(a)
                return function (data, name) {
                    var blob = new Blob([data], {type: "application/octet-stream"}),
                        url = window.URL.createObjectURL(blob)
                    a.href = url
                    a.download = name
                    a.click()
                    a.remove()
                    window.URL.revokeObjectURL(url)
                }
                }())
                console.log(e.target.id)
                if(e.target.id === "btnSaveWav")
                    saveByteArray(cocoCasWave, 'out.wav')
                else if(e.target.id === "btnSaveDsk"){
                    let disk = makeDsk(vDskEntries)
                    saveByteArray(disk, 'out.dsk')
                }else
                    saveByteArray(cas, 'out.cas')
            }
        }())
