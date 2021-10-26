import Vue from 'vue'
import { get, keys } from 'lodash'
import { canRunWidget } from '@/plugins/helpers'

function setDefaults(object, defaults) {
  for (let key of keys(defaults)) {
    if (typeof object[key] == 'undefined') {
      this.$set(object, key, defaults[key])
    }
  }
  return object
}


Vue.mixin({

  created () { 
    this.vm = this 
    this.debug = () => { debugger }
  },

  mounted () {

    Object.assign(this, {
      window,
      console: window.console
    })

    if (!window.vms)
      window.vms = {}
    
    if (!window.vms[this._name])
      window.vms[this._name] = []
    
    window.vms[this._name].push(this)

  },

  computed: {
  },

  methods: {
    canRunWidget,
    hasQueryTag(tag) {
      return typeof this.$route.query[tag] !== 'undefined'
    },
    setDefaults
  }

})