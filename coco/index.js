        (async function() {

            const Audio = document.getElementById("Audio")
            , fileInput = document.getElementById("file-input")
            , btnSaveWav = document.getElementById("btnSaveWav")
            , btnSaveCas = document.getElementById("btnSaveCas")
            , selZFiles = document.getElementById("selZFiles")
            , selDFiles = document.getElementById("selDFiles")
            , FileCS = document.getElementById("FileCS")
            , CasCS = document.getElementById("CasCS")
            , WavCS = document.getElementById("WavCS")
            , taBas = document.getElementById("taBas")
            btnSaveWav.onclick = Download
            btnSaveCas.onclick = Download
            fileInput.onchange = readZipFiles //readFile
            selZFiles.ondblclick = selZFilesOnChange
            selDFiles.ondblclick = selDFilesOnChange
            
            let zentries, dir, dskbuf, cas, cocoCasWave
        
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
                selZFiles.style.display = "block"
                selDFiles.style.display = "none"
        
                if(f.name.toLowerCase().endsWith(".zip")){
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
                    selZFiles.options.length = 0
                    await readFile(f)
                }
            }
        
            async function selZFilesOnChange() {
                selDFiles.style.display = "none"
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
                selDFiles.style.display = "block"

                dskbuf = new Uint8Array(d)
                dir = getDirectory(dskbuf)
                for (const e of dir) {
                    var opt = document.createElement('option')
                    opt.value = `${e.name}.${e.ext}` 
                    opt.innerHTML = `${opt.value} bytes: ${e.size} ascii: ${e.ascii} type: ${e.type}`
                    selDFiles.appendChild(opt)
                }
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
                else 
                    saveByteArray(cas, 'out.cas')
            }
        }())
