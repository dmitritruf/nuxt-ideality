import { request } from 'express'

const express = require('express')


const axios = require('axios')
const yaml = require('js-yaml')
const { stripIndent } = require('common-tags')
const { parse } = JSON
const { filteredParameters } = require('../plugins/helpers')
// console.log(filteredParameters)
const ipInt = require('ip-to-int')

const Bubble = require('../plugins/bubble')
const admin = new Bubble.default({ token: 'Bearer ' + process.env.BUBBLE_TOKEN})
// const { default: { admin }} = Bubble

const { buildPrompt, complete, parseResponse } = require('../plugins/build')
console.log(require('../plugins/build'))

const jsyaml = require('js-yaml')

const app = express()

// try {

  const _ = require('lodash')
  const { assign, filter, find, get, keys, map, pickBy, reject, set } = _

  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))
  app.set('trust proxy', true)

  // const log = thing => {
  //   console.log(thing)
  //   return thing
  // }

  // axios.interceptors.request.use(log, log)
  // axios.interceptors.response.use(log, log)

  const baseURL = process.env.NUXT_ENV_BUBBLE_URL
  // console.log({baseURL})

  const getIpInfo = ip => admin.get('/obj/ip', { params: {
      constraints: [{
        key: 'int',
        constraint_type: 'equals',
        value: ipInt(ip).toInt()
      }]
    }}).then(data => data.response.info)

  const log = what => ( console.log(what), what )

  app.get('/test', function (req, res) {
    res.send(req.ip)
  })
    
  app.post('/democode', async (req, res) => {
    
  })

  // let users = {}

  async function getUser(token, ignoreErrors, next) {
    let user //= users[token]
    // if (!user) {
      try {
        user = await (
          new Bubble.default({ token })
        ).go('getUserInfo')
      } catch (err) {
        next(err)
        // if ( ignoreErrors )
          // return undefined
        // else
        //   throw(err)
      } 
      // finally {
      //   next()
      // }
    //   users[token] = user
    //   setTimeout(() => delete users[token], 1000 * 3600 * 24)
    // }
    return user
  }

  app.get('/auth/clear', () => users = {})
  // app.get('/auth/list', (req, res) => res.send(users))

  app.get('/auth/user', async ( {headers: { authorization: token }}, res, next ) => {
    try {
      let user = await getUser(token, null, next)
      // console.log({users})
      res.send({user})
    } catch(err) {
      next(err)
    }
  })

  app.post('/complete', completeWithCheck)

  async function completeWithCheck(
    {
      body: { prompt, n, stop, allowUnsafe, engine, apiKey, temperature },
      ip,
      ignoreQuotaCheck
    },
    res,
    next
  ) {

    try {

      // console.log({ prompt })

      // Check quota
      if ( !ignoreQuotaCheck ) {
        let { ip: { runsLeft }} = await admin.go('runsLeft--', { ip })

        if ( runsLeft <= 0 )
        return res.status(403).send("Quota exceeded; please come back in an hour or add “?apiKey=[your OpenAI key starting with ‘sk-’]” to the URL. (We don’t store your API key, it will be used to make a request directly from your browser.)")  
      }

      // Only allow unsafe requests if sent with the user's own api key
      if ( !allowUnsafe && !apiKey ) {
        apiKey = process.env.OPENAI_KEY
        allowUnsafe = false
      }

      // Check safety in the background if needed
      let headers = {
        Authorization: `Bearer ${apiKey}`
      }

      let safetyChecked = 
        !allowUnsafe && 
          axios.post('https://api.openai.com/v1/engines/content-filter-alpha/completions', {
            prompt: `<|endoftext|>${prompt}\n--\nLabel:`,
            temperature: 0,
            top_p: 0,
            max_tokens: 1,
            logprobs: 10
          }, { headers })

      // Prepare request

      let response = await complete({ engine, temperature, prompt, n, stop, apiKey })
      
      if (!allowUnsafe) {

        let { data: { choices: [{ text: safetyLabel }]}} = await safetyChecked

        console.log({ safetyLabel })
        
        if ( safetyLabel.match(/[1]/) )
          return res.status(403).send({
            error: {
              cause: 'unsafe', 
              allowUnsafe,
              message: 'Unsafe input, please consider revising...'
            }
          })

      }
      
      // console.log({ response })
      return response

    } catch (error) {
      next(error)
    }

  }

  app.post('/getImage', async (
    {
      body: {
        query, orientation
      }
    },
    res, next
  ) => {
    try {
      !orientation && ( orientation = 'landscape' )
      console.log({query})
      let { data: {
        photos: [ photo ]
      }} = await axios.get(`https://api.pexels.com/v1/search?query=${query}&orientation=${orientation}&per_page=1`, {
        headers: { Authorization: process.env.PEXELS_KEY }
      })
      // console.log({photo})
      
      return res.send(photo)
    } catch(error) {
      console.log({error})
      // next(error)
    }
  })

  app.post('/widget/generate', async (req, res, next) =>
  {
    // console.log(req)
    try {

      // console.log(req.ip)
      // console.log(req.body)
      let { n, input, output, appendInput, duringSetup, exampleIndex, widget, apiKey, code, pr0n: allowUnsafe, fake_ip } = {
        input: '', output: '', n: 1, 
        ...req.body
      }

      let ip = req.ip || fake_ip      

      let { id } = widget

      const widgetLoaded = 
        !( widget && widget.setup && widget.slate )
        && admin.get('widget', id)
          .then( ({ setup, slate, tie }) => 
            assign(widget, {
              setup: { ...setup, ...widget.setup },
              slate, tie,
              ...widget
            })
          )
      
      let quota = {}
      
      let runsLeft = {}
      if ( apiKey ) {
        allowUnsafe = true
      }
      else {
        let ipInfo = await admin.get('ip', `ip-${ip.replace(/\./g, '-')}`) || {}
        console.log({ ipInfo })
        runsLeft.ip = ipInfo.runsLeft
        if ( runsLeft.ip < 0 ) {
          return res.status(403).send({
            error: {
              cause: 'quota', 
              message: 'Quota exceeded. Please come back in an hour or add “?apiKey=[your OpenAI key]” to the URL to make the request using your own key. (We don’t store your API key and will only use to make a request directly from your browser.)'
            }
          })
        }
      }

      await widgetLoaded

      runsLeft.widget = widget.runsLeft

      if ( runsLeft.widget < 0 ) {
        return res.status(403).send({
          error: {
            cause: 'widget_quota', 
            message: 'Widget quota exceeded. Please come back next day or add “?apiKey=[your OpenAI key]” to the URL to make the request using your own key. (We don’t store your API key and will only use to make a request directly from your browser.)'
          }
        })
      }

      let { setup, slate, tie } = widget
      // ;( { apiKey } = slate )
      if ( !apiKey )
        apiKey = process.env.OPENAI_KEY

      if ( slate.allowUnsafe )
        allowUnsafe = true

      console.log({ buildPrompt })
      let { prompt, stop, prefix } = buildPrompt({ setup, slate, tie, duringSetup, exampleIndex, input, appendInput, output })
      
      // console.log({allowUnsafe})

      let response = await completeWithCheck(
        {
          body: { prompt, n, stop, allowUnsafe, apiKey},
          ip,
          ignoreQuotaCheck: true
        },
        res,
        next
      )
    
      // console.log('response: ', response.data)

      // console.log({input, output})

      let content = parseResponse({ input, output, appendInput, prefix, response, n })
      
      delete quota.ip
      // console.log({content})
      
      let decrement = ( prompt.length + content.output.length ) / 2000

      console.log({ decrement })

      admin.go('runsLeft--', { ip, widget: widget.id, decrement })//.then(runsLeftResponse => console.log({ runsLeftResponse }))

      res.send({content, runsLeft: map(quota, 'runsLeft') })
    } catch(error) {
      try {
        console.log({error})
        let { statusCode, body: {status, message, path }} = error
        return res.status(statusCode).send({
          error: {
            cause: 'bubble_error', 
            status,
            message,
            path
          }
        })
      } catch(err) {
        let { message, stack } = error
        return res.status(500).send({error: { message, stack }})
      }
    }

  })

  app.post('/error', async (req, res, next) => {
    try {
      await Bubble.default.anon.go('nope')
    } catch(error) {
      console.log({error})
      res.status(403).send(error)
    }
  })

  app.post('/widget/track', async ({ 
    headers: { referer }, 
    body: { 
      widget: { id }, actor, action
    },
    ip
  }, res, next) => {

    actor || ( actor = ip )

    admin.post('widgetEvent', { widget: id, actor, action, referer })

    res.send(null)

  })

// } catch (err) {
//   console.log(err)
//   // throw(err)
// }

export default {
  path: '/api',
  handler: app
}


