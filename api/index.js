const demoTemplate = {
  parameters: [
    {
      type: "text",
      name: "Product",
      recital: true, 
      multiline: true
    }
  ],
  apiKey: "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",
  instruction:
`Suggest ideas on how to use various products based on various user bios.

Product:
an app for managing all kinds of lists

User bio (avoid choices that are too obvious for that product):
I’m juggling freelance work, grad school classes, and a social life.

Ideas tailored to the product (avoid generic ones):
Create lists for
• Task assignments
• Useful resources for students
• Notes from meetings with clients
• Games for your next get-together

Product:
a tweet scheduler

User bio (avoid choices that are too obvious for that product):
We are a startup that brings AI to Edge Computing.

Ideas tailored to the product (avoid generic ones):
Tweet about
• The latest AI technologies
• Various ideas on adding AI to edge devices
• Behind the scenes of running a stratup`,
  inputPrefix: "User bio (avoid choices that are too obvious for that product)",
  outputPrefix: "Ideas tailored to the product (avoid generic ones)",
  omitExamples: true,
  stop: ['\nProduct:']
}

const express = require('express')
const axios = require('axios')
const yaml = require('js-yaml')
const { stripIndent } = require('common-tags')
const { parse } = JSON
const { filteredParameters } = require('../plugins/helpers')
// console.log(filteredParameters)
const ipInt = require('ip-to-int')
const Bubble = require('../plugins/bubble')
const jsyaml = require('js-yaml')

const app = express()

const _ = require('lodash')
const { assign, filter, find, get, keys, map, pickBy } = _

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.set('trust proxy', true)

// const log = thing => {
//   console.log(thing)
//   return thing
// }

// axios.interceptors.request.use(log, log)
// axios.interceptors.response.use(log, log)

const baseURL = 'https://b.ideality.app/api/1.1/'

const admin = axios.create({ 
  baseURL,
  headers: {'Authorization': 'Bearer d51e2dc8a6dd89ef0fc9f36a9f3d5c20'} 
})


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

const users = {}

async function getUser(token, ignoreErrors) {
  let user = users[token]
  if (!user) {
    try {
      user = await (
        new Bubble.default({ token })
      ).go('getUserInfo')  
    } catch (err) {
      if ( ignoreErrors )
        return undefined
      else
        throw(err)
    }
    users[token] = user
    setTimeout(() => delete users[token], 1000 * 3600 * 24)
  }
  return user
}

app.get('/auth/user', async ( {headers: { authorization: token }}, res, next ) => {
  try {
    let user = await getUser(token)
    res.send({user})
  } catch(err) {
    next(log(err))
  }
})

app.post('/widget/generate', async (req, res, next) =>
{
  try {

    console.log(req.ip)
    console.log(req.body)
    let { input, output, appendInput, duringSetup, widget, apiKey, iddqd: godMode, pr0n: allowUnsafe, code, fake_ip } = {
      input: '', output: '',
      ...req.body
    }

    let ip = req.ip || fake_ip      

    let { id } = widget

    let isDemo = id=='demo'
    if ( isDemo ) {
      widget.template = demoTemplate
      code = '1635431643111x338474208627258500'
    }
    
    const widgetLoaded = 
      !( widget && widget.setup && widget.template )
      && Bubble.default.admin.get('widget', id)
        .then( ({ setup, template, tie }) => 
          assign(widget, {
            setup, template, tie,
            ...widget
          })
        )
    
    let runsLeft = {}

    if ( godMode || isDemo || apiKey || get(widget, 'template.apiKey') ) {
      allowUnsafe = true
    }
    else {
      if ( !godMode ) {
        runsLeft = await Bubble.default.admin.go('runsLeft--', { code, ip, widget: widget.id })
        let quotaExceeded = keys(
          pickBy(
            runsLeft, value => 
            value <= 0
          )
        )[0]
        console.log({runsLeft, quotaExceeded})
        if ( quotaExceeded ) {
          if ( quotaExceeded != 'ip' || !await getUser(get(req, 'headers.authorization') ))
            return res.status(403).send({
              error: {
                cause: 'quota', 
                message: ({
                  ip: 'User',
                  code: 'Code',
                  widget: 'Widget',
                  owner: 'Widget owner'
                })[quotaExceeded] + ' quota exceeded.'
              }
            })
        }
      }
    }

    await widgetLoaded
    let { setup, template, tie } = widget
    ;( { apiKey } = template )
    let { parameterValues, examples } = setup
    let { instruction, inputPrefix, outputPrefix, omitExamples } = {...template, ...tie}
    let { parameters } = template

    let prefix = {}
    
    for ( let useAs of ['input', 'output'] ) {
      let parameter = find(parameters, { useAs })
      if ( parameter )
        prefix[useAs] = parameterValues[parameter.name].replace(/^(an?|the) /,'').toUpperCase()
      else
        prefix[useAs] = template[useAs + 'Prefix']
    }

    console.log({prefix})

    if ( duringSetup )
      examples.pop()

    // console.log(setup, template)

    let prompt = [
      instruction,
      filteredParameters({setup, template, onlyRecitals: true, duringGeneration: true}).map(({ name }) =>
        `${name}:\n${parameterValues[name]}`
      ).join('\n\n'),
      (examples || []).map(example =>
        `${prefix.input}:\n- ${example.input}\n\n${prefix.output}:\n${example.output}`
      ).join('\n\n'),
      prefix.input+':\n-'
    ].filter(a=>a).join('\n\n')

    for ( let { name } of _.reject(parameters, { recital: true })) {
      prompt = prompt.replace(`<${name}>`, parameterValues[name])
    }

    if ( input )
      prompt += input
      
    if ( input && !appendInput || output)
      prompt += `\n\n${prefix.output}:\n${output}`
  
    // console.log(prompt)

    let stop = [
      prefix.input + ':', 
      ...(examples && examples.length) || omitExamples ? [] : ['\n'],
      ...template.stop || []
    ]

    let payload = {
      prompt,
      temperature: 0.75, 
      max_tokens: 200, 
      frequency_penalty: 1,
      presence_penalty: 1,
      n: 1,
      stop
    }
  
    console.log(payload)

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
      }, {headers})

    let engine = template.engine || 'curie-instruct-beta'
    let response = await axios.post(
      `https://api.openai.com/v1/engines/${engine}/completions`,
      payload, {headers}
    )
    
    if (!allowUnsafe) {
      let { data: { choices: [{ text: safetyLabel }]}} = await safetyChecked
      
      console.log(safetyLabel)
  
      if ( safetyLabel.match(/[12]/) )
        return res.status(403).send({
          error: {
            cause: 'unsafe', 
            message: 'Unsafe input'
          }
        })
  
    }
  
    console.log(response.data)
    let { text } = response.data.choices[0]
  
    // console.log(text)
  
    if ( input && !appendInput ) 
      output += text.trimEnd()
    else {
      [input, output] = (input + text).trimEnd().split(prefix.output+':').map(s=>s.trim())
      if ( !output )
        [input] = input.split("\n")
    }
    
    delete runsLeft.ip

    res.send({content: {input, output}, runsLeft })
  } catch(err) {
    console.log(err)
    next(err)
  }

})


export default {
  path: '/api',
  handler: app
}

