import axios from 'axios';
import { metricsBaseURL } from '../config';
import { getTimePath, getStatPath } from '../helpers/precomputed';

export const routesUrl =
  'https://opentransit-precomputed-stats.s3.amazonaws.com/routes_v2_sf-muni.json.gz';

export function fetchGraphData(params) {
  return function(dispatch) {
    axios
      .get('/api/metrics', {
        params,
        baseURL: metricsBaseURL,
      })
      .then(response => {
        dispatch({
          type: 'RECEIVED_GRAPH_DATA',
          payload: response.data,
          graphParams: params,
        });
      })
      .catch(err => {
        const errStr =
          err.response && err.response.data && err.response.data.error
            ? err.response.data.error
            : err.message;
        dispatch({ type: 'RECEIVED_GRAPH_ERROR', payload: errStr });
      });
  };
}

export function resetGraphData() {
  return function(dispatch) {
    dispatch({ type: 'RESET_GRAPH_DATA', payload: null });
  };
}

export function fetchIntervalData(params) {
  return function(dispatch) {
    axios
      .get('/api/metrics_by_interval', {
        params,
        baseURL: metricsBaseURL,
      })
      .then(response => {
        dispatch({
          type: 'RECEIVED_INTERVAL_DATA',
          payload: response.data,
          graphParams: params,
        });
      })
      .catch(err => {
        const errStr =
          err.response && err.response.data && err.response.data.error
            ? err.response.data.error
            : err.message;
        dispatch({ type: 'RECEIVED_INTERVAL_ERROR', payload: errStr });
      });
  };
}

export function resetIntervalData() {
  return function(dispatch) {
    dispatch({ type: 'RESET_INTERVAL_DATA', payload: null });
  };
}

export function fetchRoutes() {
  return function(dispatch) {
    axios
      .get(routesUrl)
      .then(response => {
        dispatch({ type: 'RECEIVED_ROUTES', payload: response.data.routes });
      })
      .catch(err => {
        dispatch({ type: 'RECEIVED_ROUTES_ERROR', payload: err });
      });
  };
}

export function fetchPrecomputedWaitAndTripData(params) {
  return function(dispatch, getState) {
    const timeStr = params.startTime
      ? `${params.startTime}-${params.endTime}`
      : '';
    const dateStr = params.date;

    const tripTimesCache = getState().routes.tripTimesCache;

    const tripTimes = tripTimesCache[`${dateStr + timeStr}median`];

    if (!tripTimes) {
      const timePath = getTimePath(timeStr);
      const statPath = getStatPath('median');

      const s3Url = `https://opentransit-precomputed-stats.s3.amazonaws.com/trip-times/v1/sf-muni/${dateStr.replace(
        /-/g,
        '/',
      )}/trip-times_v1_sf-muni_${dateStr}_${statPath}${timePath}.json.gz`;

      axios
        .get(s3Url)
        .then(response => {
          dispatch({
            type: 'RECEIVED_PRECOMPUTED_TRIP_TIMES',
            payload: [response.data, `${dateStr + timeStr}median`],
          });
        })
        .catch(() => {
          /* do something? */
        });
    }

    const waitTimesCache = getState().routes.waitTimesCache;
    const waitTimes = waitTimesCache[`${dateStr + timeStr}median`];

    if (!waitTimes) {
      const timePath = getTimePath(timeStr);
      const statPath = getStatPath('median');

      const s3Url = `https://opentransit-precomputed-stats.s3.amazonaws.com/wait-times/v1/sf-muni/${dateStr.replace(
        /-/g,
        '/',
      )}/wait-times_v1_sf-muni_${dateStr}_${statPath}${timePath}.json.gz`;

      axios
        .get(s3Url)
        .then(response => {
          dispatch({
            type: 'RECEIVED_PRECOMPUTED_WAIT_TIMES',
            payload: [response.data, `${dateStr + timeStr}median`],
          });
        })
        .catch(() => {
          /* do something? */
        });
    }
  };
}

/**
 * Action creator that fetches arrival history from S3 corresponding to the
 * day and route specified by params.
 *
 * @param params graphParams object
 */
export function fetchArrivals(params) {
  return function(dispatch, getState) {

    const dateStr = params.date;

    const s3Url = `https://opentransit-stop-arrivals.s3.amazonaws.com/v4/sf-muni/${dateStr.replace(
        /-/g,
        '/',
      )}/arrivals_v4_sf-muni_${dateStr}_${params.route_id}.json.gz`;

    axios
      .get(s3Url)
      .then(response => {
      dispatch({
        type: 'RECEIVED_ARRIVALS',
        payload: [response.data, dateStr, params.route_id],
      });
    })
    .catch(err => {
      /* do something? */
    });
  }
}

export function handleSpiderMapClick(stops, latLng) {
  return function(dispatch) {
    dispatch({ type: 'RECEIVED_SPIDER_MAP_CLICK', payload: [stops, latLng] });
  };
}

/**
 * This is an action creator where the action calls two actions.
 * Basically this a way of calling two APIs at once, where two APIs
 * have no interactions with each other.
 */
export function fetchData(graphParams, intervalParams) {
  return function(dispatch) {
    dispatch(fetchGraphData(graphParams));
    dispatch(fetchIntervalData(intervalParams));
  };
}

export function handleGraphParams(params) {
  return function(dispatch, getState) {
    dispatch({ type: 'RECEIVED_GRAPH_PARAMS', payload: params });
    const graphParams = getState().routes.graphParams;

    // for debugging: console.log('hGP: ' + graphParams.routeId + ' dirid: ' + graphParams.directionId + " start: " + graphParams.startStopId + " end: " + graphParams.endStopId);
    // fetch graph data if all params provided
    // TODO: fetch route summary data if all we have is a route ID.

    if (graphParams.date) {
      dispatch(fetchPrecomputedWaitAndTripData(graphParams));
    }

    if (
      graphParams.routeId &&
      graphParams.directionId &&
      graphParams.startStopId &&
      graphParams.endStopId
    ) {
      const intervalParams = Object.assign({}, graphParams);
      delete intervalParams.startTime; // for interval api, clear out start/end time and use defaults for now
      delete intervalParams.endTime; // because the hourly graph is spiky and can trigger panda "empty axes" errors.

      dispatch(fetchData(graphParams, intervalParams));
    } else {
      // when we don't have all params, clear graph data

      dispatch(resetGraphData());
      dispatch(resetIntervalData());
    }
  };
}
