/* global _, jQuery, wp, foxhoundTheme, wpApiSettings */
( function( $, api, foxhoundTheme ) {
	var debouncedRequestPostUpdate;

	/**
	 * Update title.
	 *
	 * @param {string} title - Title.
	 * @param {boolean} [isRendered=false] - Whether the title is rendered (with entities).
	 * @returns {void}
	 */
	function updateTitle( title, isRendered ) {
		var containers = $( '.site-title a' );
		if ( isRendered ) {
			containers.html( title );
		} else {
			containers.text( title );
		}
	}

	// Update the site title when its setting changes.
	api( 'blogname', function( setting ) {
		var populateRenderedTitle;

		function handleResponse( response ) {
			response.json().then( function( data ) {
				updateTitle( data.rendered, true );
			} );
		}

		populateRenderedTitle = _.debounce( function() {
			fetch( wpApiSettings.root + 'foxhound/v1/title/' ).then( handleResponse );
		}, api.settings.timeouts.selectiveRefresh );

		setting.bind( function( to ) {

			// Instant low-fidelity preview.
			updateTitle( to, false );

			// Server-rendered high-fidelity preview.
			populateRenderedTitle();
		} );
	} );

	/**
	 * Override the handler for clicking links in preview to allow history.pushState() to do its thing.
	 *
	 * @param {jQuery.Event} event Event.
	 * @returns {void}
	 */
	api.Preview.prototype.handleLinkClick = function handleLinkClick( event ) {
		var link, isInternalJumpLink;
		link = $( event.target );

		// No-op if the anchor is not a link.
		if ( _.isUndefined( link.attr( 'href' ) ) ) {
			return;
		}

		isInternalJumpLink = ( '#' === link.attr( 'href' ).substr( 0, 1 ) );

		// Allow internal jump links to behave normally without preventing default.
		if ( isInternalJumpLink ) {
			return;
		}

		// If the link is not previewable, prevent the browser from navigating to it.
		if ( ! api.isLinkPreviewable( link[0] ) ) {
			wp.a11y.speak( api.settings.l10n.linkUnpreviewable );
			event.preventDefault();
		}
	};

	/**
	 * Request post update.
	 *
	 * @param {object} data - Post data.
	 * @returns {void}
	 */
	function requestPostUpdate( data ) {
		var postTypeInterface = foxhoundTheme.postTypes[ data.type ];
		if ( ! postTypeInterface ) {
			return;
		}
		postTypeInterface.request( data.slug )( function( action ) {
			foxhoundTheme.store.dispatch( action ); // @todo Do we need store here?
		} );
	}

	debouncedRequestPostUpdate = _.wrap(
		_.memoize(
			function() {
				return _.debounce( requestPostUpdate, api.settings.timeouts.selectiveRefresh );
			},
			_.property( 'id' )
		),
		function( func, obj ) {
			return func( obj )( obj );
		}
	);

	/**
	 * Listen to post and postmeta changes and sync into store.
	 */
	api.bind( 'change', function( setting ) {
		var idParts, settingType, postType, postId, metaKey, value, data, postTypeInterface;
		idParts = setting.id.replace( /]/g, '' ).split( /\[/ );
		settingType = idParts.shift();

		if ( 'post' !== settingType && 'postmeta' !== settingType ) {

			// @todo Support nav menus.
			return;
		}

		postType = idParts.shift();

		// Only posts and pages are currently supported.
		if ( ! foxhoundTheme.postTypes[ postType ] ) {
			return;
		}
		postTypeInterface = foxhoundTheme.postTypes[ postType ];

		postId = parseInt( idParts.shift(), 10 );
		if ( isNaN( postId ) ) {
			return;
		}
		if ( 'postmeta' === settingType ) {
			metaKey = idParts.shift();
			if ( ! metaKey ) {
				return;
			}
		}

		if ( 'post' === settingType ) {
			data = _.clone( postTypeInterface.selector( foxhoundTheme.store.getState(), postId ) );
			value = setting.get();

			// Apply low-fidelity instant preview.
			data.title.rendered = value.post_title;
			data.content.rendered = value.post_content.replace( /\n/g, '<br>' );
			data.excerpt.rendered = value.post_excerpt.replace( /\n/g, '<br>' );
			postTypeInterface.dispatchSuccess( data );

			// Apply high-fidelity rendered preview from server.
			debouncedRequestPostUpdate( data );
		}
	} );
} )( jQuery, wp.customize, foxhoundTheme );
