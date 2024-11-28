(function(w) {

  let worker, tainted, url='http://localhost:5000/upload'||'https://voice-ai-sql-python.vercel.app/upload', audioCtx, mediaR, _chunks=[], chunks=[], audio, fReader = new FileReader(), canvas, isFirst;
  w_Ev_dom(function() {
    /** legacy code: window.<element.id> obtain reference to node via its id, conveinent but may be frowned upon  */
    canvas  =  window.visualize.transferControlToOffscreen(),
    (worker = new Worker("js/worker.js")).postMessage({ canvas }, [canvas])
  })

  function Aud(_audio) {
    return new Promise((res, rej)=>{
     /*prevent multiple calls after very first or when the required object is not available*/
      if(Aud.inited) return rej(true/*makes this if condition always true and exit here*/);
      if(!navigator.mediaDevices.getUserMedia) return rej(true/*give up trying to retry by not setting Audio.inited to false in catch clause*/);

      Aud.inited=!0,
      navigator.mediaDevices.getUserMedia({ echoCancellation:true, audio: true }).then(stream=>{
        audio = _audio,
        onSuccess(stream, res)/*resolve the promise in this function to ensure that mediaR is defined by `.then(...)` [^_^ pun absolutely intended]*/
      }, err=>rej())
    })
  }

  function onSuccess(_stream, res, end, options) {
    Aud.bitRate && (options = {audioBitsPerSecond: Aud.bitRate}),
    (Aud._mediaR = mediaR = new MediaRecorder(_stream, options)).onstop=_=>{
      _stream.getAudioTracks().forEach(function(track) {
        track.stop();
      }), 
      end=!0, audio.src = stream(/*end*/end)/*only call stream onstop to get the audio file src*/
      chunks=[], Aud.inited = null
    }, res(),
    Aud.fxns = [_=>mediaR.start(Aud.timeSlice), _=>mediaR[mediaR.state==='paused'?'resume':'pause'](), _=>mediaR.stop()],
    mediaR.ondataavailable=e=>{
      chunks.push(e.data), _chunks.push(e.data),
      /* only attempt to stream data if the time slice for audio has been provided prior*/
      Aud.timeSlice&&stream()
    }, visualize(_stream)
  }

  function stream(end) {
    /*Use chunks in lieu of _chunks if there was a network disconnect which tainted _chunks when streaming it*/
    let blob = new Blob(tainted?chunks:_chunks, { type: mediaR.mimeType });
    fReader.onload=_=>{
      let bs64 = fReader.result,
          data = {recording:bs64.split('base64,')[1]};
      console.log('::DATA::', data), 
      fetch(url, {
        method:'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify(data)
      }).then(res=>res.json())
      .then(res=>{
        /** to clear the outpane of the SQL queries the first time this is done */
        isFirst||=!(window.queries.textContent='');
        let intel=wndow.intelligence.textContent.trim().split(/\n/).filter(e=>e),
        { text } = res, txt, n = (intel.length/2)|0, even = N(n,0,2);

        /**Because the AI may infer punctuation marks from diction and pauses, remove the ones recongnized in the inferred text*/
        even.forEach(e=>text = text.replace(intel[e], '')),
        /** now replace each word that spells a symbol with the symbol */
        even.forEach((e, i)=>txt = (txt||text).replace(new RegExp(intel[e+1], 'i'), intel[e])),
        console.log('RESPONSE::TEXT::', res, text, txt)
      }).catch(_=>{
        tainted=!0/*:TASK: write message to SQL output to state writing all when recording has ended */
      })
    }, 
    /*only read the blob dataURL when provided via dataavailable to avoid errors by reading the same blob twice*/
    !end&&fReader.readAsDataURL(blob),
    /*clear streamed _chunks*/
    _chunks = [];
    if(end) return URL.createObjectURL(blob)
  }
  
  function visualize(stream) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let source = audioCtx.createMediaStreamSource(stream),
    analyser = audioCtx.createAnalyser();
    source.connect(analyser), analyser.connect(audioCtx.destination), analyser.fftSize=128;

    let bufferLength = analyser.frequencyBinCount,
        dataArray    = new Uint8Array(bufferLength);
        // canvasCtx    = canvas.getContext('2d'), monit=0;
 
  //   (function draw() {
  //   const WIDTH = canvas.width;
  //   const HEIGHT = canvas.height;

  //   requestAnimationFrame(draw);

  //   analyser.getByteTimeDomainData(dataArray);
  //   // ++monit>1000&&(canvasCtx.clearRect(0, 0, WIDTH, HEIGHT), monit=0);

  //   canvasCtx.fillStyle = "rgb(255, 255, 255)";
  //   canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

  //   canvasCtx.lineWidth = 2;
  //   canvasCtx.strokeStyle = "rgb(0, 0, 0)";

  //   canvasCtx.beginPath();

  //   let sliceWidth = (WIDTH * 1.0) / bufferLength;
  //   let x = 0;
  //   for (let i = 0; i < bufferLength; i++) {
  //     let v = dataArray[i] / 128.0;
  //     let y = (v * HEIGHT) / 2;

  //     if (i === 0) {
  //       canvasCtx.moveTo(x, y);
  //     } else {
  //       canvasCtx.lineTo(x, y);
  //     }

  //     x += sliceWidth;
  //   }
  //   canvasCtx.lineTo(canvas.width, canvas.height / 2);
  //   canvasCtx.stroke();
  // })()
  /*code for visualization starts here*/
  (function animate() {
    analyser.getByteFrequencyData(dataArray),
    worker.postMessage({ bufferLength, dataArray }, {}),
    requestAnimationFrame(animate)
  })()
  }
  w.Aud = Aud
})(window)