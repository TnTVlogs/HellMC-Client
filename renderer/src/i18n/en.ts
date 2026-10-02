// Idioma de referència (06 §9): `es.ts`/`ca.ts` han de tenir exactament la mateixa forma
// (comprovat per TypeScript via `Messages`, com al panell — `HellMC-Client-Panel/frontend`).
export interface Messages {
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
    nav: {
      account: string
      game: string
      java: string
      launcher: string
      updates: string
      about: string
    }
    account: {
      microsoftTitle: string
      microsoftConnect: string
      offlineTitle: string
      offlineUsernamePlaceholder: string
      addOffline: string
      empty: string
      active: string
      select: string
      remove: string
    }
    game: {
      title: string
      resolution: string
      width: string
      height: string
      fullscreen: string
      autoConnect: string
      launchDetached: string
      dataDirectory: string
      dataDirectoryChange: string
      dataDirectoryRestartHint: string
      sharedDataRoot: string
      sharedDataRootHelp: string
      sharedDataRootHellmc: string
      sharedDataRootSystem: string
    }
    java: {
      title: string
      globalExecutable: string
      globalExecutableHelp: string
      notSet: string
      choose: string
      clear: string
      detectedTitle: string
      detectedEmpty: string
      detecting: string
    }
    launcher: {
      title: string
      language: string
      theme: string
      themeSystem: string
      themeDark: string
      themeLight: string
      uiScale: string
      performance: string
      performanceAuto: string
      performanceOn: string
      performanceOff: string
      sidebarCollapsed: string
      devMode: string
      devModeHint: string
    }
    updates: {
      title: string
      currentVersion: string
      checkNow: string
      checking: string
      upToDate: string
      available: string
      downloading: string
      ready: string
      readyHint: string
      error: string
    }
    about: {
      title: string
      forkNotice: string
      coreNotice: string
      nebulaNotice: string
      thirdPartyLicenses: string
      website: string
      source: string
      support: string
    }
  }
  home: {
    title: string
    loadingDistro: string
    noServer: string
    noVersionAvailable: string
    playingAs: string
    play: string
    cancel: string
    noAccount: string
    offlineUsernamePlaceholder: string
    addOfflineAccount: string
    phase: {
      idle: string
      starting: string
      'refreshing-distribution': string
      'validating-account': string
      'verifying-files': string
      downloading: string
      launching: string
      ready: string
      closed: string
      error: string
    }
  }
  servers: {
    playWithoutServer: string
    playWithoutServerDesc: string
    empty: string
    versionsCount: string
  }
  serverDetail: {
    notFound: string
    back: string
    version: string
    recommended: string
  }
  versions: {
    empty: string
    install: string
    installed: string
    notInstalled: string
    updateAvailable: string
  }
  versionDetail: {
    notFound: string
    back: string
    verify: string
    uninstall: string
    uninstallConfirm: {
      title: string
      message: string
      confirm: string
      cancel: string
    }
    changelog: string
    tabs: {
      summary: string
      mods: string
      java: string
      files: string
    }
    files: {
      path: string
      openFolder: string
      size: string
      notInstalled: string
    }
    mods: {
      search: string
      count: string
      required: string
      blocked: string
      alsoEnabled: string
      alsoDisabled: string
      andMore: string
      empty: string
    }
    dataSharing: {
      title: string
      help: string
      changeNotice: string
      forcedNotice: string
      forcedTooltip: string
    }
    java: {
      executable: string
      notConfigured: string
      noneFound: string
      detecting: string
      autoDetect: string
      chooseManually: string
      downloadAuto: string
      downloading: string
      downloadFailed: string
      phase: {
        fetchingJdk: string
        downloadingJava: string
        extractingJava: string
      }
      minRam: string
      maxRam: string
    }
  }
  news: {
    title: string
    loading: string
    offlineCache: string
    filterAll: string
    global: string
    back: string
    openWeb: string
    refresh: string
    empty: string
    offlineBanner: string
  }
  instances: {
    running: string
    forceClose: string
    confirmTitle: string
    confirmMessage: string
    confirmForceClose: string
    cancel: string
  }
}

const en: Messages = {
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
    nav: {
      account: 'Account',
      game: 'Game',
      java: 'Java',
      launcher: 'Launcher',
      updates: 'Updates',
      about: 'About'
    },
    account: {
      microsoftTitle: 'Microsoft account',
      microsoftConnect: 'Add Microsoft account',
      offlineTitle: 'Offline account',
      offlineUsernamePlaceholder: 'Username',
      addOffline: 'Add account',
      empty: 'No accounts yet.',
      active: 'Active',
      select: 'Use this account',
      remove: 'Remove'
    },
    game: {
      title: 'Game',
      resolution: 'Window size',
      width: 'Width',
      height: 'Height',
      fullscreen: 'Launch in fullscreen',
      autoConnect: 'Auto-connect to the server',
      launchDetached: 'Keep the game running if the launcher closes',
      dataDirectory: 'Data folder',
      dataDirectoryChange: 'Change…',
      dataDirectoryRestartHint: 'Takes effect after restarting the launcher.',
      sharedDataRoot: 'Shared data location',
      sharedDataRootHelp: 'Where versions marked "shared" keep their worlds, resource packs, shaders, screenshots and options. Applies to all shared versions at once.',
      sharedDataRootHellmc: 'HellMC (default)',
      sharedDataRootSystem: 'System .minecraft'
    },
    java: {
      title: 'Java',
      globalExecutable: 'Global default Java executable',
      globalExecutableHelp: 'Used for versions you haven\'t set up yet. A version you already configured (Versions > detail > Java) keeps its own choice.',
      notSet: 'Not set — new versions auto-detect or ask, same as before.',
      choose: 'Choose…',
      clear: 'Clear',
      detectedTitle: 'Detected Java installations',
      detectedEmpty: 'No Java installations found on this system.',
      detecting: 'Scanning…'
    },
    launcher: {
      title: 'Launcher',
      language: 'Language',
      theme: 'Theme',
      themeSystem: 'System',
      themeDark: 'Dark',
      themeLight: 'Light',
      uiScale: 'Interface size',
      performance: 'Performance mode',
      performanceAuto: 'Automatic',
      performanceOn: 'On',
      performanceOff: 'Off',
      sidebarCollapsed: 'Collapse sidebar',
      devMode: 'Developer mode',
      devModeHint: 'Click the version number in About a few times to reveal this.'
    },
    updates: {
      title: 'Updates',
      currentVersion: 'Current version',
      checkNow: 'Check now',
      checking: 'Checking for updates…',
      upToDate: 'You\'re up to date.',
      available: 'Update {version} found — downloading in the background.',
      downloading: 'Downloading update… {percent}%',
      ready: 'Update ready.',
      readyHint: 'It will install itself the next time you close the launcher — no action needed.',
      error: 'Couldn\'t check for updates: {message}'
    },
    about: {
      title: 'About',
      forkNotice: 'HellMC Client is a fork of HeliosLauncher by Daniel D. Scalzi (MIT license).',
      coreNotice: 'Uses HellMC-Core, a modified fork of helios-core (LGPL-3.0).',
      nebulaNotice: 'Distribution server based on Nebula (Daniel D. Scalzi, MIT).',
      thirdPartyLicenses: 'Third-party licenses',
      website: 'Website',
      source: 'Source code',
      support: 'Support'
    }
  },
  home: {
    title: 'Home',
    loadingDistro: 'Loading distribution…',
    noServer: 'No server',
    noVersionAvailable: 'No version available',
    playingAs: 'Playing as {name}',
    play: 'Play',
    cancel: 'Cancel',
    noAccount: 'Add an offline account to start playing.',
    offlineUsernamePlaceholder: 'Username',
    addOfflineAccount: 'Add account',
    phase: {
      idle: 'Idle',
      starting: 'Starting…',
      'refreshing-distribution': 'Checking for updates…',
      'validating-account': 'Validating account…',
      'verifying-files': 'Verifying files…',
      downloading: 'Downloading…',
      launching: 'Launching…',
      ready: 'Launched',
      closed: 'Closed',
      error: 'Error'
    }
  },
  servers: {
    playWithoutServer: 'Play without a server',
    playWithoutServerDesc: 'Pick a version and play locally or on any server.',
    empty: 'No servers published yet.',
    versionsCount: '{count} versions'
  },
  serverDetail: {
    notFound: 'Server not found.',
    back: 'Back to servers',
    version: 'Version',
    recommended: 'recommended'
  },
  versions: {
    empty: 'No versions published yet.',
    install: 'Install',
    installed: 'Installed',
    notInstalled: 'Not installed',
    updateAvailable: 'Update available'
  },
  versionDetail: {
    notFound: 'Version not found.',
    back: 'Back to versions',
    verify: 'Verify',
    uninstall: 'Uninstall',
    uninstallConfirm: {
      title: 'Uninstall this version?',
      message: 'This frees {size} on disk. Mods, libraries and managed config are removed; your saves, screenshots and options are kept.',
      confirm: 'Uninstall',
      cancel: 'Cancel'
    },
    changelog: 'Changelog',
    tabs: {
      summary: 'Summary',
      mods: 'Mods',
      java: 'Java & memory',
      files: 'Files'
    },
    files: {
      path: 'Instance folder',
      openFolder: 'Open folder',
      size: 'Size on disk',
      notInstalled: 'Not installed yet — this is where it will be installed.'
    },
    mods: {
      search: 'Search mods…',
      count: '{enabled} of {total} enabled',
      required: 'Required',
      blocked: "Can't be disabled: it's required by {list}.",
      alsoEnabled: 'Also enabled (it needs them): {list}.',
      alsoDisabled: 'Also disabled (nothing else needs them): {list}.',
      andMore: 'and {count} more',
      empty: 'This version has no mods.'
    },
    dataSharing: {
      title: 'Share worlds, resource packs and options with other versions',
      help: 'Worlds, textures, shaders, screenshots and options are shared with the other versions that also have this on. Mods and mod configuration always stay separate per version.',
      changeNotice: 'This change applies the next time you play this version.',
      forcedNotice: 'This version always keeps its own data.',
      forcedTooltip: 'The server admin set this version to never share data with others.'
    },
    java: {
      executable: 'Java executable',
      notConfigured: 'Not configured',
      noneFound: 'No compatible Java installation found.',
      detecting: 'Detecting…',
      autoDetect: 'Auto-detect',
      chooseManually: 'Choose manually',
      downloadAuto: 'Download Java automatically',
      downloading: 'Downloading Java…',
      downloadFailed: 'Java download failed. Try again or choose a Java installation manually.',
      phase: {
        fetchingJdk: 'Finding the right build…',
        downloadingJava: 'Downloading Java',
        extractingJava: 'Extracting…'
      },
      minRam: 'Minimum RAM',
      maxRam: 'Maximum RAM'
    }
  },
  news: {
    title: 'News',
    loading: 'Loading news…',
    offlineCache: 'Showing cached news (offline).',
    filterAll: 'All',
    global: 'Global',
    back: 'Back to news',
    openWeb: 'Open on the web',
    refresh: 'Refresh',
    empty: 'No news yet.',
    offlineBanner: 'Latest news downloaded: {date}'
  },
  instances: {
    running: '{count} running',
    forceClose: 'Force close',
    confirmTitle: 'Force close this instance?',
    confirmMessage: 'This will immediately close {version}. Any unsaved progress in that game will be lost.',
    confirmForceClose: 'Yes, force close',
    cancel: 'Cancel'
  }
}

export default en
