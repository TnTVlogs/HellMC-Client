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
    discord: string
    website: string
  }
  ui: {
    svcAuth: string
    svcServices: string
    svcSession: string
    minecraftChecking: string
    minecraftDown: string
    minecraftPartial: string
    minecraftOk: string
    aboutServer: string
    aboutTitle: string
    accounts: string
    addAccount: string
    all: string
    allF: string
    alwaysOn: string
    assetsCredits: string
    availableAt: string
    changeServer: string
    copyAddress: string
    credits: string
    descAutoConnect: string
    descDetached: string
    descFullscreen: string
    descLanguage: string
    descPerformance: string
    descResolution: string
    descScale: string
    descSidebar: string
    descTheme: string
    details: string
    diskSize: string
    featured: string
    filter: string
    filterByTag: string
    folder: string
    installedF: string
    jvmArgs: string
    lastUpdate: string
    main: string
    mcLoader: string
    modsHint: string
    noConnection: string
    noServer: string
    offlineLabel: string
    open: string
    optional: string
    pickVersion: string
    playWithoutServer: string
    players: string
    ramHint: string
    requiredMods: string
    rescan: string
    revision: string
    search: string
    searchServer: string
    searchVersion: string
    serverNews: string
    serversSubtitle: string
    size: string
    social: string
    source: string
    state: string
    suggestedJava: string
    switchAccount: string
    update: string
    updateAll: string
    versionLabel: string
    versionSettings: string
    versionsAvailable: string
    versionsSubtitle: string
    viewAllNews: string
    withUpdate: string
    working: string
    installAndPlay: string
    updateAndPlay: string
  }
  placeholder: {
    comingSoon: string
  }
  auth: {
    error: {
      NO_PROFILE: string
      NO_XBOX_ACCOUNT: string
      XBL_BANNED: string
      UNDER_18: string
      UNKNOWN: string
    }
  }
  network: {
    offline: string
    sessionInvalid: string
  }
  boot: {
    updateRequired: {
      restart: string
      none: string
      ready: string
      downloading: string
      checking: string
      check: string
      body: string
      title: string
    }
    starting: string
    needNetworkTitle: string
    needNetworkBody: string
    retry: string
  }
  welcome: {
    title: string
    subtitle: string
    start: string
    language: string
    theme: string
    themeSystem: string
    themeDark: string
    themeLight: string
    loginTitle: string
    loginSubtitle: string
    microsoftContinue: string
    microsoftHint: string
    offlineLink: string
    offlineTitle: string
    offlineSubtitle: string
    offlineUsername: string
    offlinePlay: string
    offlineHint: string
    microsoftLink: string
    invalidUsername: string
    waitingTitle: string
    waitingBody: string
    cancel: string
    retry: string
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
      status: {
        checking: string
        invalid: string
        offline: string
        ok: string
      }
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
      channelHelp: string
      channel: string
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
      lgplLicense: string
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
    offlineAccountWarning: string
    authInvalidTitle: string
    authInvalidBody: string
    authInvalidAction: string
    needNetworkTitle: string
    needNetworkBody: string
    close: string
    retry: string
    microsoftOffline: string
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
    settings: 'Settings',
    discord: 'Discord',
    website: 'Website'
  },
  ui: {
    svcAuth: 'Authentication',
    svcServices: 'Profile & skins',
    svcSession: 'Sessions',
    minecraftChecking: 'Checking Minecraft services…',
    minecraftDown: 'Minecraft services unreachable',
    minecraftPartial: 'Some Minecraft services unreachable',
    minecraftOk: 'Minecraft services online',
    aboutServer: 'About the server',
    aboutTitle: 'About HellMC Client',
    accounts: 'Accounts',
    addAccount: 'Add account',
    all: 'All',
    allF: 'All',
    alwaysOn: 'Always active',
    assetsCredits: 'Icons: Lucide (ISC). Interface font: system fonts.',
    availableAt: 'Available at',
    changeServer: 'Change server',
    copyAddress: 'Copy address',
    credits: 'Credits and licenses',
    descAutoConnect: 'Join the server when the game opens (only if you picked a server)',
    descDetached: 'The game stays open if you close the launcher',
    descFullscreen: 'Start the game in fullscreen',
    descLanguage: 'Interface language',
    descPerformance: 'Turns off animations and effects on low-end computers',
    descResolution: 'Size of the game window',
    descScale: 'Scales the whole launcher',
    descSidebar: 'Show only icons in the sidebar',
    descTheme: 'Follow the system or pick one',
    details: 'Details',
    diskSize: 'Size on disk',
    featured: 'Featured',
    filter: 'Filter',
    filterByTag: 'Filter by tag',
    folder: 'Folder',
    installedF: 'Installed',
    jvmArgs: 'JVM arguments',
    lastUpdate: 'Last update: {date}',
    main: 'Main',
    mcLoader: 'Minecraft · loader',
    modsHint: 'Turn off a mod and the dependencies only it needs are turned off too; a dependency stays locked while any enabled mod needs it. The list is flat, with no subgroups.',
    noConnection: 'No connection',
    noServer: 'No server',
    offlineLabel: 'Offline',
    open: 'Open',
    optional: 'Optional',
    pickVersion: 'Pick a version',
    playWithoutServer: 'Play without a server',
    players: 'players',
    ramHint: 'Total system memory: {total} GB. Leaving at least 2 GB free is recommended.',
    requiredMods: 'Required',
    rescan: 'Scan again',
    revision: 'Revision',
    search: 'Search',
    searchServer: 'Search a server…',
    searchVersion: 'Search a version…',
    serverNews: 'Server news',
    serversSubtitle: 'Pick where to play and with which version. You can also play without a server.',
    size: 'Size',
    social: 'Social links',
    source: 'Source',
    state: 'Status',
    suggestedJava: 'Suggested Java',
    switchAccount: 'Switch account',
    update: 'Update',
    updateAll: 'Update all',
    versionLabel: 'Version',
    versionSettings: 'Version settings',
    versionsAvailable: 'Available versions',
    versionsSubtitle: 'Manage what you have installed. Every version can be played without a server.',
    viewAllNews: 'See all news →',
    withUpdate: 'With update',
    working: 'Working…',
    installAndPlay: 'Install and play',
    updateAndPlay: 'Update and play'
  },
  placeholder: {
    comingSoon: 'Coming soon.'
  },
  auth: {
    error: {
      NO_PROFILE: 'This Microsoft account has no Minecraft: Java Edition profile. Set it up at minecraft.net.',
      NO_XBOX_ACCOUNT: 'This Microsoft account has no Xbox account associated.',
      XBL_BANNED: 'Xbox Live is not available in the country of this Microsoft account.',
      UNDER_18: 'Accounts for users under 18 must be added to a Family by an adult.',
      UNKNOWN: 'Unknown error while signing in. Check the console for details.'
    }
  },
  network: {
    offline: 'Offline: showing saved data. Online servers will not be available.',
    sessionInvalid: 'Your account session is no longer valid. Go to Settings › Account and sign in again.'
  },
  boot: {
    updateRequired: {
      restart: 'Restart and install',
      none: 'No update found yet. Try again in a moment.',
      ready: 'Update ready. Restart the launcher to install it.',
      downloading: 'Downloading update… {percent}%',
      checking: 'Checking…',
      check: 'Check for updates',
      body: 'This version of HellMC Client is too old for the current distribution. Update to keep playing.',
      title: 'Update required',
    },
    starting: 'Starting…',
    needNetworkTitle: 'Connect to start',
    needNetworkBody: 'HellMC needs an internet connection the first time it runs.',
    retry: 'Try again'
  },
  welcome: {
    title: 'Welcome to HellMC',
    subtitle: 'Play on our servers with everything installed and kept up to date automatically.',
    start: 'Get started',
    language: 'Language',
    theme: 'Theme',
    themeSystem: 'System',
    themeDark: 'Dark',
    themeLight: 'Light',
    loginTitle: 'Sign in',
    loginSubtitle: 'You need a Microsoft account with Minecraft: Java Edition.',
    microsoftContinue: 'Continue with Microsoft',
    microsoftHint: 'A Microsoft window will open. We never store your password.',
    offlineLink: 'No connection? Play offline',
    offlineTitle: 'Offline mode',
    offlineSubtitle: 'Without a Microsoft account you can only play single-player or on servers that do not require authentication.',
    offlineUsername: 'Username',
    offlinePlay: 'Play offline',
    offlineHint: 'No internet connection needed. Your identifier (UUID) is generated from the name.',
    microsoftLink: 'I have a Microsoft account',
    invalidUsername: 'Use 3–16 letters, numbers or underscores.',
    waitingTitle: 'Waiting for the Microsoft window…',
    waitingBody: 'Complete the sign-in in the window that just opened.',
    cancel: 'Cancel',
    retry: 'Try again'
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
      status: {
        checking: 'Validating…',
        invalid: 'Session expired: sign in again',
        offline: 'Offline: could not validate',
        ok: 'Session valid',
      },
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
      channelHelp: 'Receive beta versions before everyone else.',
      channel: 'Pre-release versions',
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
      lgplLicense: 'LGPL-3.0 license (HellMC-Core)',
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
    offlineAccountWarning: 'Offline account: you can only join servers that do not require authentication.',
    authInvalidTitle: 'Sign in again',
    authInvalidBody: 'Your account session is no longer valid.',
    authInvalidAction: 'Go to Account',
    needNetworkTitle: 'Connection required',
    needNetworkBody: 'An internet connection is needed to install or update this version.',
    close: 'Close',
    retry: 'Try again',
    microsoftOffline: 'No connection: you will not be able to join online servers.',
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
