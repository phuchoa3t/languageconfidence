const DeepSpeech = require('deepspeech');
const Fs = require('fs');
const Sox = require('sox-stream');
const MemoryStream = require('memory-stream');
const Duplex = require('stream').Duplex;
const Wav = require('node-wav');
const spawn = require('child_process').spawnSync;
const express = require('express')
var bodyParser = require('body-parser')


const app = express()
const port = 3000
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json({
	limit: '50mb'
}))
app.post('/', (req, res) => {
	// words.push(word.text) //text
	// timeStarts.push(word.start) // start
	let originalText = req.body.text.replace(/[^a-zA-Z ]/gi, '').toLowerCase().split(' ');
	// console.log(words, timeStarts)
	// res.send('Hello World!')
	let modelPath = './deepspeech-0.9.3-models.pbmm';

	let model = new DeepSpeech.Model(modelPath);

	let desiredSampleRate = model.sampleRate();

	let scorerPath = './deepspeech-0.9.3-models.scorer';

	model.enableExternalScorer(scorerPath);

	let audioFile = process.argv[2] || './audio/ok.wav';
	// let 
	if (!Fs.existsSync(audioFile)) {
		console.log('file missing:', audioFile);
		process.exit();
	}


	console.log()
	let base64 = req.body.buffer;
	
	let buffer = Buffer.from(base64, 'base64')
	// let buffer = Fs.readFileSync(audioFile);

	Fs.writeFileSync('file.wav', buffer);

	const result = Wav.decode(buffer);

	if (result.sampleRate < desiredSampleRate) {
		console.error('Warning: original sample rate (' + result.sampleRate + ') is lower than ' + desiredSampleRate + 'Hz. Up-sampling might produce erratic speech recognition.');
	}

	function bufferToStream(buffer) {
		let stream = new Duplex();
		stream.push(buffer);
		stream.push(null);
		return stream;
	}

	let audioStream = new MemoryStream();
	bufferToStream(buffer).
		pipe(Sox({
			global: {
				'no-dither': true,
			},
			output: {
				bits: 16,
				rate: desiredSampleRate,
				channels: 1,
				encoding: 'signed-integer',
				endian: 'little',
				compression: 0.0,
				type: 'raw'
			}
		})).
		pipe(audioStream);

	// convert file to text
	audioStream.on('finish', () => {
		let audioBuffer = audioStream.toBuffer();

		const audioLength = (audioBuffer.length / 2) * (1 / desiredSampleRate);
		console.log('audio length', audioLength);

		let result = model.sttWithMetadata(audioBuffer);

		let words = [];
		let timeStarts = [];
		let word = {
			text: '',
			start: 0
		};
		result.transcripts[0].tokens.forEach(item => {
			if (item.text == ' ') {
				words.push(word.text)
				timeStarts.push(word.start)
				word = {
					text: '',
					start: 0
				};
			} else {
				word.text += item.text
				if (word.start === 0) {
					word.start = item.start_time
				}
			}
		})

		words.push(word.text) //text
		timeStarts.push(word.start) // start
		console.log(words, timeStarts)
		result = [];
		while (words.length) {
			wordStartIndex = 0
			wordEndIndex = words[0];
			for (let i = 1; i < words.length; i++) {
				if (timeStarts[i] - timeStarts[wordStartIndex] < 15) {
					wordEndIndex = i
				} else {
					break;
				}
			}
			console.log(wordStartIndex, wordEndIndex)
			let arr = words.slice(wordStartIndex, wordEndIndex + 1);
			let index = []
			let matches = arr.map(w => {
				return originalText.findIndex((x, i, a) => {
					if (x == w && index.indexOf(i) == -1) {
						index.push(i)
						return true;
					}
					return false;
				})
			})
			for (let i = matches.length - 1; i > 0; i--) {
				if (matches[i] - matches[i - 1] == 1) {
					wordEndIndex = i;
					break;
				}
			}
			wordEndIndex += matches.filter((d, i)=> {return d == -1 && i <= wordEndIndex}).length

			arr = originalText.slice(wordStartIndex, wordEndIndex + 1);
			originalText.splice(wordStartIndex, wordEndIndex + 1)
			totalEndSeconds = timeStarts[wordEndIndex];
			hours = Math.floor(totalEndSeconds / 3600);
			hours = hours < 10 ? ('0' + hours) : hours;
			totalEndSeconds %= 3600;
			minutes = Math.floor(totalEndSeconds / 60);
			minutes = minutes < 10 ? ('0' + minutes) : minutes;
			seconds = totalEndSeconds % 60;
			seconds = seconds < 10 ? ('0' + seconds) : seconds;

			totalStartSeconds = timeStarts[wordStartIndex];
			hoursStart = Math.floor(totalStartSeconds / 3600);
			hoursStart = hoursStart < 10 ? ('0' + hoursStart) : hoursStart;
			totalStartSeconds %= 3600;
			minutesStart = Math.floor(totalStartSeconds / 60);
			minutesStart = minutesStart < 10 ? ('0' + minutesStart) : minutesStart;
			secondsStart = totalStartSeconds % 60;
			secondsStart = secondsStart < 10 ? ('0' + secondsStart) : secondsStart;
			
			let name = (Math.random() + 1).toString(36).substring(7) + '.wav'
			var ffmpeg = spawn('ffmpeg', [
				'-i',
				'file.wav',
				'-acodec',
				'copy',
				'-ss',
				hoursStart + ":" + minutesStart + ":" + secondsStart,
				'-t',
				hours + ":" + minutes + ":" + seconds,
				name,
			]);
			result.push({
				text: arr.join(' '),
				buffer: Fs.readFileSync(name, 'base64')
			})
			words.splice(wordStartIndex, wordEndIndex + 1)
			timeStarts.splice(wordStartIndex, wordEndIndex + 1)
			// return;
		}
		res.send(result)
		// Fs.writeFileSync('./out.text', JSON.stringify(result))
	});

})

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`)
})
