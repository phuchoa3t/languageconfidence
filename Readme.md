# NodeJS voice recognition example using Mozilla DeepSpeech

###### Prepare to Run Project:

Nodejs Version 

```
v15.14.0
```

Install Sox and ffmpeg (for .wav file loading):

```
brew install sox
brew install ffmpeg
```

Install wget (on Mac):

```
brew install wget
```

Download the pre-trained model (1.8GB):

```
wget https://github.com/mozilla/DeepSpeech/releases/download/v0.9.3/deepspeech-0.9.3-models.pbmm
wget https://github.com/mozilla/DeepSpeech/releases/download/v0.9.3/deepspeech-0.9.3-models.scorer
```

###### How To Run Project:

Install NPM dependencies:

```
npm install
```

Run:

```
node index.js
or
npm start
```

###### Get audio and text test:

The website to get audio and text test

```
https://www.voiptroubleshooter.com/open_speech/american.html
```

The website to covert from audio to base64

```
https://base64.guru/converter/encode/audio
```

###### Test Project by Postman

Domain:

```
http://localhost:3000
```

Method:

```
POST
```

Body:

```
{
    "buffer": "Audio has been converted to base64",
    "text": "Text Test"
}
```

Result: (example: audio length: 40s)
```
    [
      { 
        "buffer":"Audio has been cut 1",
        "text":"Text has been cut 1"
      },
    { 
        "buffer":"Audio has been cut 2",
        "text":"Text has been cut 2"
      },
    { 
        "buffer":"Audio has been cut 3",
        "text":"Text has been cut 3"
      }
    ]
```

###### Check result

```
    Copy a buffer in result response 
    Open https://base64.guru/converter/decode/audio to convert buffer to audio
    Compare audio with text in result response 
```
