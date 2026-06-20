import common from "./common.json";
import nav from "./nav.json";
import calendar from "./calendar.json";
import tasks from "./tasks.json";
import insights from "./insights.json";
import inbox from "./inbox.json";
import sleep from "./sleep.json";
import settings from "./settings.json";
import auth from "./auth.json";
import recurrence from "./recurrence.json";
import events from "./events.json";
import toasts from "./toasts.json";
import validation from "./validation.json";
import share from "./share.json";
import errors from "./errors.json";

/** Composed English catalog. Each surface owns its own namespace file so
 *  translation work never collides on a single JSON. English is the source of
 *  truth — `messages/ru/*` mirrors these keys. */
const messages = {
  common,
  nav,
  calendar,
  tasks,
  insights,
  inbox,
  sleep,
  settings,
  auth,
  recurrence,
  events,
  toasts,
  validation,
  share,
  errors,
};

export default messages;
