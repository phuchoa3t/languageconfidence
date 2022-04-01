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
	let base64 = req.body.buffer;

	let buffer = Buffer.from(base64, 'base64')
	let fileName = (Math.random() + 1).toString(36).substring(7) + '.wav'
	Fs.writeFileSync(fileName, buffer);

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
		let timeEnds = [];
		let word = {
			text: '',
			start: 0
		};
		result.transcripts[0].tokens.forEach(item => {
			console.log(item)
			
			if (item.text == ' ') {
				words.push(word.text)
				timeStarts.push(word.start)
				timeEnds.push(word.end)
				word = {
					text: '',
					start: word.end
				};
			} else {
				word.end = item.start_time
				word.text += item.text
			}
		})

		words.push(word.text) //text
		timeStarts.push(word.start) // start
		timeEnds.push(word.end) // start
		console.log(words, timeStarts,timeEnds, originalText)
		result = [];
		let isFirst = true;
		let end = false;
		while (words.length && !end) {
			wordStartIndex = 0
			if (timeEnds[words.length - 1] - timeStarts[wordStartIndex] < 15) {
				wordEndIndex = words.length - 1;
				end = true;
			} else {
				for (let i = 1; i < words.length; i++) {
					if (timeEnds[i] - timeStarts[wordStartIndex] < 15) {
						wordEndIndex = i
					} else {
						break;
					}
				}
			}

			let arr = end? words: words.slice(wordStartIndex, wordEndIndex + 1);
			console.log('1',wordEndIndex)
			if(!end) {
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
				console.log('2', wordEndIndex, matches)
				arr = originalText.slice(wordStartIndex, matches[wordEndIndex] + 1);
				originalText.splice(wordStartIndex, matches[wordEndIndex] + 1)
				// wordEndIndex += 1;
			} else {
				arr = originalText;
				// originalText.splice(wordStartIndex, originalText.length)
			}
			// console.log(arr.join(' '))
			totalEndSeconds = timeEnds[wordEndIndex];
			hours = Math.floor(totalEndSeconds / 3600);
			hours = hours < 10 ? ('0' + hours) : hours;
			totalEndSeconds %= 3600;
			minutes = Math.floor(totalEndSeconds / 60);
			minutes = minutes < 10 ? ('0' + minutes) : minutes;
			seconds = totalEndSeconds % 60;
			seconds = seconds < 10 ? ('0' + seconds) : seconds;

			totalStartSeconds = isFirst?0: timeStarts[wordStartIndex];
			hoursStart = Math.floor(totalStartSeconds / 3600);
			hoursStart = hoursStart < 10 ? ('0' + hoursStart) : hoursStart;
			totalStartSeconds %= 3600;
			minutesStart = Math.floor(totalStartSeconds / 60);
			minutesStart = minutesStart < 10 ? ('0' + minutesStart) : minutesStart;
			secondsStart = totalStartSeconds % 60;
			secondsStart = secondsStart < 10 ? ('0' + secondsStart) : secondsStart;
			console.log(wordStartIndex, wordEndIndex,secondsStart, seconds )

			let name = (Math.random() + 1).toString(36).substring(7) + '.wav'
			let endFF = end? []: ['-to',
			hours + ":" + minutes + ":" + seconds];
			console.log([
				'-i',
				fileName,
				
				
				'-ss',
				hoursStart + ":" + minutesStart + ":" + secondsStart,
				...endFF,
				'-c',
				'copy',
				name,
			])
			var ffmpeg = spawn('ffmpeg', [
				'-i',
				fileName,
				'-acodec',
				'copy',
				'-ss',
				hoursStart + ":" + minutesStart + ":" + secondsStart,
				...endFF,
				name,
			]);
			result.push({
				text: arr.join(' '),
				buffer: Fs.readFileSync(name, 'base64')
			})

			try {
				Fs.unlinkSync(name)
			//file removed
			} catch(err) {
				console.error(err)
			}
			words.splice(wordStartIndex, wordEndIndex + 1)
			timeStarts.splice(wordStartIndex, wordEndIndex + 1)
			timeEnds.splice(wordStartIndex, wordEndIndex + 1)
			isFirst = false;
			// return;
		}
		Fs.unlinkSync(fileName)
		res.send(result)
		// Fs.writeFileSync('./out.text', JSON.stringify(result))
	});

})

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`)
})
// The boy was there when the sun rose a rod is used to catch pink salmon the source of the huge river is the clear spring kick the ball straight and follow through help the woman get back to her feet a pot of tea helps to pass the evening smoky fires lack flame and heat the soft cushion broke the man's fall the salt breeze came across from the sea the girl at the booth sold fifty bonds.
