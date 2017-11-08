/*global FoxhoundSettings, FoxhoundData, FoxhoundMenu, jQuery, wp */
// Load in the babel (es6) polyfill, and fetch polyfill
import 'babel-polyfill';
import 'whatwg-fetch';

// React
import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import { Router, Route, browserHistory, applyRouterMiddleware } from 'react-router';
import { syncHistoryWithStore } from 'react-router-redux';
import { useScroll } from 'react-router-scroll';
import { bindActionCreators } from 'redux';
import { escapeRegExp } from 'lodash';

// Load the CSS
require( '../sass/style.scss' );

// Internal
import Navigation from 'components/navigation';
import Index from 'components/posts';
import SinglePost from 'components/post';
import SinglePage from 'components/post/page';
import Term from 'components/term';
import Attachment from 'components/attachment';
import Search from 'components/search';
import DateArchive from 'components/date';
import Author from 'components/author';
import NotFound from 'components/not-found';
import { createReduxStore } from './state';
import { setMenu } from 'wordpress-query-menu/lib/state';
import { setPost, setPosts } from './utils/initial-actions';
import { requestPost, POST_REQUEST_SUCCESS } from 'wordpress-query-posts/lib/state';
import { getPost } from 'wordpress-query-posts/lib/selectors';
import { requestPage, PAGE_REQUEST_SUCCESS } from 'wordpress-query-page/lib/state';
import { getPage } from 'wordpress-query-page/lib/selectors';

// Accessibility!
import { keyboardFocusReset, skipLink, toggleFocus } from 'utils/a11y';

// Now the work starts.
const store = createReduxStore();
const history = syncHistoryWithStore( browserHistory, store );
const path = FoxhoundSettings.URL.path || '/';

function renderApp() {
	let blogURL, frontPageRoute;
	if ( FoxhoundSettings.frontPage.page ) {
		blogURL = path + 'page/' + FoxhoundSettings.frontPage.blog + '/';
		frontPageRoute = <Route path={ path } slug={ FoxhoundSettings.frontPage.page } component={ SinglePage } />;
	} else {
		blogURL = path;
		frontPageRoute = null;
	}

	const routerMiddleware = applyRouterMiddleware( useScroll( shouldUpdateScroll ), keyboardFocusReset( 'main' ) );

	// Add the event Jetpack listens for to initialize various JS features on posts.
	const emitJetpackEvent = () => {
		jQuery( document.body ).trigger( 'post-load' );
	}

	// Routes
	const routes = (
		<Router history={ history } render={ routerMiddleware } onUpdate={ emitJetpackEvent }>
			<Route path={ blogURL } component={ Index } />
			<Route path={ `${ blogURL }p/:paged` } component={ Index } />
			{ frontPageRoute }
			<Route path={ `${ path }search/:search` } component={ Search } />
			<Route path={ `${ path }attachment/:id` } component={ Attachment } />
			<Route path={ `${ path }category/:slug` } taxonomy="category" component={ Term } />
			<Route path={ `${ path }category/:slug/p/:paged` } taxonomy="category" component={ Term } />
			<Route path={ `${ path }tag/:slug` } taxonomy="post_tag" component={ Term } />
			<Route path={ `${ path }tag/:slug/p/:paged` } taxonomy="post_tag" component={ Term } />
			<Route path={ `${ path }date/:year` } component={ DateArchive } />
			<Route path={ `${ path }date/:year/p/:paged` } component={ DateArchive } />
			<Route path={ `${ path }date/:year/:month` } component={ DateArchive } />
			<Route path={ `${ path }date/:year/:month/p/:paged` } component={ DateArchive } />
			<Route path={ `${ path }date/:year/:month/:day` } component={ DateArchive } />
			<Route path={ `${ path }date/:year/:month/:day/p/:paged` } component={ DateArchive } />
			<Route path={ `${ path }author/:slug` } component={ Author } />
			<Route path={ `${ path }author/:slug/p/:paged` } component={ Author } />
			<Route path={ `${ path }page/**` } component={ SinglePage } />
			<Route path={ `${ path }:year/:month/:slug` } component={ SinglePost } />
			<Route path="*" component={ NotFound } />
		</Router>
	);

	render(
		(
			<Provider store={ store }>
				{ routes }
			</Provider>
		),
		document.getElementById( 'main' )
	);

	if ( FoxhoundMenu.enabled ) {
		render(
			(
				<Provider store={ store }>
					<Navigation />
				</Provider>
			),
			document.getElementById( 'site-navigation' )
		);
	} else {
		// Run this to initialize the focus JS for PHP-generated menus
		initNoApiMenuFocus();
	}
}

// Callback for `useScroll`, which skips the auto-scrolling on skiplinks
function shouldUpdateScroll( prevRouterProps, { location } ) {
	if ( location.hash ) {
		return false;
	}
	return true;
}

// Initialize keyboard functionality with JS for non-react-build Menus (if the API doesn't exist)
function initNoApiMenuFocus() {
	const container = document.getElementById( 'site-navigation' );
	if ( ! container ) {
		return;
	}

	const menu = container.getElementsByTagName( 'div' )[1];
	// No menu, no need to run the rest.
	if ( ! menu ) {
		return;
	}

	const links = menu.getElementsByTagName( 'a' );
	// Each time a menu link is focused or blurred, toggle focus.
	let i, len;
	for ( i = 0, len = links.length; i < len; i++ ) {
		links[i].addEventListener( 'focus', toggleFocus, true );
		links[i].addEventListener( 'blur', toggleFocus, true );
	}

	const button = container.getElementsByTagName( 'button' )[0];
	button.onclick = function() {
		if ( -1 !== menu.className.indexOf( 'menu-open' ) ) {
			menu.className = menu.className.replace( ' menu-open', '' );
			menu.setAttribute( 'aria-expanded', 'false' );
			button.setAttribute( 'aria-expanded', 'false' );
		} else {
			menu.className += ' menu-open';
			menu.setAttribute( 'aria-expanded', 'true' );
			button.setAttribute( 'aria-expanded', 'true' );
		}
	};
}

// Set up link capture on all links in the app context.
function handleLinkClick() {
	// This regex matches any string with the wp site's URL in it, but we want to trim the trailing slash
	let regexBaseUrl = FoxhoundSettings.URL.base;
	if ( '/' === regexBaseUrl[ regexBaseUrl.length - 1 ] ) {
		regexBaseUrl = regexBaseUrl.slice( 0, regexBaseUrl.length - 1 );
	}
	const escapedSiteURL = new RegExp( escapeRegExp( regexBaseUrl ).replace( /\//g, '\\\/' ) );

	jQuery( '#page' ).on( 'click', 'a[rel!=external][target!=_blank]', ( event ) => {
		// Don't capture clicks offsite
		if ( ! escapedSiteURL.test( event.currentTarget.href ) ) {
			return;
		}

		// Custom functionality for attachment pages
		const linkRel = jQuery( event.currentTarget ).attr( 'rel' );
		if ( linkRel && linkRel.search( /attachment/ ) !== -1 ) {
			event.preventDefault();
			const result = jQuery( event.currentTarget ).attr( 'rel' ).match( /wp-att-(\d*)/ );
			const attachId = result[ 1 ];
			history.push( path + 'attachment/' + attachId );
			return;
		}

		// Don't capture clicks to wp-admin, or the RSS feed
		if ( /wp-(admin|login)/.test( event.currentTarget.href ) || /\/feed\/$/.test( event.currentTarget.href ) ) {
			return;
		}
		event.preventDefault();
		let url = event.currentTarget.href;

		url = url.replace( FoxhoundSettings.URL.base, FoxhoundSettings.URL.path );
		history.push( url );
	} );

	jQuery( '#page' ).on( 'click', 'a[href^="#"]', ( event ) => {
		skipLink( event.target );
	} );
}

// If we have pre-loaded data, we know we're viewing the list of posts, and should pre-load it.
function renderPreloadData() {
	const actions = bindActionCreators( { setMenu, setPost, setPosts }, store.dispatch );
	actions.setMenu( 'primary', FoxhoundMenu.data );

	if ( FoxhoundData.data.length > 1 ) {
		actions.setPosts( FoxhoundData.data, FoxhoundData.paging );
	} else if ( FoxhoundData.data.length ) {
		const post = FoxhoundData.data[ 0 ];
		actions.setPost( post );
	}
}

document.addEventListener( 'DOMContentLoaded', function() {
	renderApp();
	renderPreloadData();
	handleLinkClick();
} );

// Export internals for the sake of the Customizer preview.
if ( typeof wp !== 'undefined' && wp.customize ) {
	window.foxhoundTheme = {
		store: store,
		postTypes: {
			post: {
				selector: getPost,
				dispatchSuccess: ( data ) => {
					store.dispatch( {
						type: POST_REQUEST_SUCCESS,
						postId: data.id,
						pagePath: data.slug,
						page: data
					} );
				},
				request: requestPost,
			},
			page: {
				selector: getPage,
				dispatchSuccess: ( data ) => {
					store.dispatch( {
						type: PAGE_REQUEST_SUCCESS,
						postId: data.id,
						pagePath: data.slug,
						page: data
					} );
				},
				request: requestPage,
			}
		}
	};
}
