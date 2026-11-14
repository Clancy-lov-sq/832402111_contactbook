import { createApp } from 'vue';

import App from './App.vue';
import { installDemoHooks } from './demo';
import './styles/main.css';

/**
 * Browser entry point.
 *
 * The application is a single page mounted into `#app`; the production build is
 * served by the Express service, so the page and the API share one origin and no
 * base URL has to be configured.
 */

createApp(App).mount('#app');

// The end-to-end capture script drives the real page through these hooks; they
// are also handy from the browser console during manual testing.
installDemoHooks();
