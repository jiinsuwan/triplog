import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

export const TripLogPrimePreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fbf7ee',
      100: '#f6efe2',
      200: '#e9c39f',
      300: '#d99a73',
      400: '#c9784f',
      500: '#c2693f',
      600: '#a95433',
      700: '#8c412b',
      800: '#713526',
      900: '#5d2f25',
      950: '#321611',
    },
    surface: {
      0: '#fffdf8',
      50: '#fbf7ee',
      100: '#f6efe2',
      200: '#efe8d9',
      300: '#e2d8c4',
      400: '#d8ccb6',
      500: '#b6ab97',
      600: '#8a8276',
      700: '#625b51',
      800: '#443e37',
      900: '#2c2926',
      950: '#171513',
    },
    colorScheme: {
      light: {
        primary: {
          color: '#c2693f',
          inverseColor: '#fbf8f1',
          hoverColor: '#a95433',
          activeColor: '#8c412b',
        },
        highlight: {
          background: 'rgba(194,105,63,0.16)',
          focusBackground: 'rgba(194,105,63,0.22)',
          color: '#2c2926',
          focusColor: '#2c2926',
        },
      },
    },
  },
})
