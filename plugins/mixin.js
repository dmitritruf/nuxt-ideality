import Vue from 'vue'
import { assign, chain, find, forEach, get, kebabCase, set, keys, mapValues, pickBy } from 'lodash'
import { appendRoute, canRunWidget, isDefined, slugify } from '@/plugins/helpers'
import axios from 'axios'
import Bubble from '~/plugins/bubble'
import { load, dump } from 'js-yaml'

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

    if (process.client) {

      Object.assign(this, {
        window,
        console: window.console
      })
  
      if (!window.vms)
        window.vms = {}
      
      if (!window.vms[this._name])
        window.vms[this._name] = []
      
      window.vms[this._name].push(this)
  
      // console.log({axios})
      if (!window.axios)
        window.axios = axios 
      
      // // Only set this once for the root component
      // if ( !this.$parent && this.$store.state.local.pending ) {

      //   this.$store.commit('set', {
      //     local: load(localStorage.getItem('data')) || {}
      //   })
  
      //   this.$watch('$store.state.local', {
      //     deep: true,
      //     handler(value) {
      //       debugger
      //       localStorage.setItem('data', dump(value))
      //     }
      //   })
      // }


    }

  },

  computed: {
    bubble() {
      return new Bubble(this)
    },

    canRunWidget,

    data() {
      return this.$data
    },


    head() {
      let { header } = this
      if ( header ) {
        let { title, description } = this.header
        title += '🔺 Ideality, AI-powered ideation platform'
        return {
          title,
          meta: [
            { hid: 'description', name: 'description', content: description },
            { hid: 'og:title', name: 'og:title', content: title},
            { hid: 'og:description', name: 'og:description', content: title }
          ]
        }  
      } else {
        return {}
      }
    },

    widgetHeader() {
      let { widget } = this
      if ( widget ) {
        let { name: title, description } = widget
        return {
          title, description 
        }
      }
    },

    isAdmin() {
      return this.$auth.user && this.$auth.user.isAdmin
    },

    process() {
      return process
    },

    queryTags() {
      return mapValues(
        pickBy(this.$route.query,
          tag => !tag && ( typeof tag !== 'undefined' )
        ), () => true)
    },

    route() {
      return this.$store.state.updatedRoute || this.$route
    },
    
    isTest() { return this.queryTags.test },
    user() { return this.$auth.user || {}}
  },

  methods: {

    appendRoute,

    appendedUrl() {
      return this.$router.resolve(this.appendRoute(...arguments)).href
    },

    control(what) {
      for ( let key of keys(what)) {
        let value = what[key]
        return {
          key: JSON.stringify(value),
          [key]: value
        }
      }
    },

    element: () => process.client && window.document.getElementById,

    hasProp(prop) {
      return isDefined(this.$props[prop])
    },

    loadLocal(pathOrOptions) {

      let local, data, getItems, item, id, items, slug, slugParam, path
      const getLocal = () => local = load(localStorage.getItem('data')) || {}

      const getData = () => (
        getLocal(),
        data = 
          typeof pathOrOptions === 'string'
            ? ( path = pathOrOptions,
              get( local, path ) 
              || get ( set ( local, path, {} ), path )
            )
            : (
              { getItems, slugParam } = pathOrOptions,
              items = getItems(local),
              slug = this.$route.params[slugParam],
              item = find(items, id ? { id } : { slug }),
              { id } = item
            )
      )

      Object.assign(this, getData())
      
      forEach(this.$data, (value, key) =>
        this.$watch(key, { deep: true, handler(value) {

          if ( key == 'name' ) {
            slugify()
            Object.assign(this, { slug: slugify(value, items) })
            return
          }

          Object.assign( getData(), this.$data)
          localStorage.setItem('data', dump(local))

          if ( key == 'slug' ) {
            this.$router.push(this.appendRoute({ params: { [slugParam]: this.slug }}))
          }

        }})
      )


    },

    withElement(id, ...actions) {
      let element = window.document.getElementById(id)
      const next = () =>
        this.$nextTick(() => {
          if ( actions.length ) {
            let action = actions.shift()
            element[action]()
            next()
          }    
        })
      next()
    },

    focus(id, ...furtherActions) {
      this.$nextTick(() => {
        let element = window.document.getElementById(id)
        if ( !element )
          return
        element.focus()
        const next = () => {
          if ( furtherActions.length ) {
            this.$nextTick(() => {
              let action = furtherActions.shift()
              element[action]()
              next()
            })
          }    
        }
        next()
      })
    },

    hasQueryTag(tag) {
      return this.queryTags[tag]
    },

    please(doWhat) {
      return doWhat.apply(this)
    },

    prop(key) {
      return this.$props[key] === '' ? true : this.$props[key]
    },

    pseudoRoute({ params, query, hash, replace }) {
      let action = replace ? 'replaceState' : 'pushState'
      window.history[action](null, null,
        this.appendedUrl({ params, query, hash })
      )
    },

    invert(what) {
      set(this, what, !get(this, what))
    },

    setFields(fields) {
      Object.assign(this, fields)
    },


    // redirectIfNotLoggedIn() {
    //   if ( !this.$auth.loggedIn )
    //     this.$router.push({
    //       name: 'login',
    //       query: {
    //         then: this.$route.fullPath
    //       }
    //     })
    // },

    setDefaults
  }

})