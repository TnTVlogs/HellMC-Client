// Idioma de referència (06 §9): `es.ts`/`ca.ts` han de tenir exactament la mateixa forma
// (comprovat per TypeScript via `Messages`, com al panell — `HellMC-Client-Panel/frontend`).
export interface Messages {
  common: {
    hello: string
    helloDesc: string
    sampleButton: string
    distroSummary: string
  }
  nav: {
    ariaLabel: string
    home: string
    servers: string
    versions: string
    news: string
    settings: string
  }
  placeholder: {
    comingSoon: string
  }
  settings: {
    appearance: {
      title: string
      theme: string
      themeSystem: string
      themeDark: string
      themeLight: string
      performance: string
      performanceAuto: string
      performanceOn: string
      performanceOff: string
    }
  }
}

const en: Messages = {
  common: {
    hello: 'Hello, HellMC',
    helloDesc: 'Preact + Vite renderer running.',
    sampleButton: 'Sample button (design tokens)',
    distroSummary: '{versions} versions · {servers} servers (mock data)'
  },
  nav: {
    ariaLabel: 'Main navigation',
    home: 'Home',
    servers: 'Servers',
    versions: 'Versions',
    news: 'News',
    settings: 'Settings'
  },
  placeholder: {
    comingSoon: 'Coming soon.'
  },
  settings: {
    appearance: {
      title: 'Appearance',
      theme: 'Theme',
      themeSystem: 'System',
      themeDark: 'Dark',
      themeLight: 'Light',
      performance: 'Performance mode',
      performanceAuto: 'Automatic',
      performanceOn: 'On',
      performanceOff: 'Off'
    }
  }
}

export default en
