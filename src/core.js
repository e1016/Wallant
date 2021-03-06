import { AsyncStorage } from 'react-native'

import message from './consts'
import { cloneOf } from './utils'

// used for AscynStorage
const STORE_NAME = '@simplestate:persistantstate:store'

class Wallant {
  constructor ({
    state,
    actions,
    persistant,
    ignore,
    validate,
    computed,
    created
  }) {

    /*
    * 'refs' is used for save
    * mounted components and dispatch
    * reactive update when state change
    */
    this.refs = []
    this.action = {}

    this.persistant = !!persistant
    this.ignore = ignore

    this.validate = validate || {}
    this.computed = computed || {}
    this.restored = false

    this.restoredCallbackStack = []

    // may no need restore state
    if (this.persistant) {
      this.restoreState()
    }

    if ((typeof state !== 'object') && !(state instanceof Array)) {
      throw message.SHOULD_BE_OBJECT
    }

    this.state = state

    /*
    * preserved state copy for
    * set again when stored state
    * is deleted
    */
    this.provisingState = Object.assign({}, state)

    /*
    * Binding 'this' to all actions
    * is neccessary for use 'this'
    * in action methods
    */
   
    for (const key in actions) {
      if (typeof actions[key] !== 'function') {
        throw message.SHOULD_BE_FUNCTION
      }

      this.action[key] = actions[key].bind(this)
    }

    /*
    * Only a shorthand
    * for setState method
    */
    this.ss = this.setState

    // on create store exec
    !!(typeof created === 'function') && created.apply(this)

    this.createComputedValues()
  }

  async restoreState () {
    const state = await AsyncStorage.getItem(STORE_NAME)

    if (state) {
      const newState = JSON.parse(state)

      this.setState({
        ...this.state,
        ...newState
      }, true)
    } else {
      this.setState(
        Object.assign({}, this.provisingState),
        true
      )
      this.restored = true
    }

    // dispatching onRestored function
    this.restoredCallbackStack.forEach(
      func => func()
    )
  }

  onRestored (callback) {
    this.restoredCallbackStack.push(
      callback
    )
  }

  commit () {
    const stateCopy = Object.assign({}, this.state)

    if (this.ignore && Array.isArray(this.ignore)) {
      this.ignore.forEach(node =>
        delete stateCopy[node]
      )
    }
    return new Promise ((resolve, reject) => {
      AsyncStorage.setItem(STORE_NAME, JSON.stringify(stateCopy))
      .then((err) => {
        if (err) { reject() }
        resolve()
      })
    })
  }

  resetState () {
    /*
    * after remove saved state
    * set a copy or original state
    * in running state
    */
    AsyncStorage.removeItem(STORE_NAME)
      .then((err) => {
        if (err) {
          throw message.STORAGE_INAVALIBLE
        }

        this.state = {}
        this.setState(
          Object.assign({}, this.provisingState),
          true
        )
      })
  }

  updateComponents () {
    this.refs.forEach(component => {
      if (component.updater.isMounted(component)) {
        component.forceUpdate()
      }
    })
  }

  createComputedValues () {
    for (const key in this.computed) {
      this.state[key] = this.computed[key].apply(this)
    }
  }

  dispatch (actionName, ...args) {
    if (action = this.action[actionName]) {
      action(...args)
    } else {
      throw new Error(`Action ${actionName} not defined`)
    }
  }

  setState (state, isCalledFromSelfStore) {

    if (typeof state === 'function') {
      state = state(Object.assign({}, this.state))

      let updatedState = state(
        cloneOf(this.state)
      )

      state = updatedState

      if (state === undefined) {
        throw message.FORGOT_RETURN_STATE
      }
    }

    for (const key in state) {
      let fnValidate
      /*
      * we assign and validate than
      * validate key exists in one step
      */

      if (fnValidate = this.validate[key]) {
        // assign state meanwhile function return true
        const accepted = fnValidate(state[key], this.state[key])

        if (accepted || !this.restored) {
          this.state[key] = state[key]
        }

      } else {
        // if isn't declared just assign
        this.state[key] = state[key]
      }
    }

    this.createComputedValues()

    if (this.persistant && isCalledFromSelfStore) {
      this.restored = true
    }

    this.updateComponents()

    return {
      commit: this.commit.bind(this)
    }
  }

  use (component) {
    // include new component in refs
    if (!this.refs.includes(component)) {
      this.refs.push(component)
    }
  }
}

export default Wallant
