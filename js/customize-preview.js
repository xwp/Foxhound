/* global _, jQuery, wp, foxhoundTheme, wpApiSettings */
( function( $, api, foxhoundTheme ) {
	var debouncedRequestPostUpdate, RestApiRenderedTextPartial;

	/**
	 * Partial for previewing a value that is available as both raw/rendered via a REST API endpoint.
	 *
	 * @class
	 * @augments wp.customize.selectiveRefresh.Partial
	 * @since 4.5.0
	 */
	RestApiRenderedTextPartial = api.selectiveRefresh.Partial.extend( {
		/* eslint consistent-this: [ "error", "partial" ] */

		/**
		 * @inheritDoc
		 */
		initialize: function( id, options ) {
			var partial = this;
			api.selectiveRefresh.Partial.prototype.initialize.call( this, id, options );
			partial.renderFetchedContent = _.debounce( partial.renderFetchedContent, api.settings.timeouts.selectiveRefresh );
		},

		/**
		 * Fetch endpoint and render the rendered content.
		 *
		 * @returns {void}
		 */
		renderFetchedContent: function renderFetchedContent() {
			var partial = this;
			fetch( partial.params.endpoint ).then( function( response ) {
				response.json().then( function( data ) {
					if ( 'undefined' === typeof data.rendered ) {
						throw new Error( 'Endpoint did not include rendered data.' );
					}
					_.each( partial.placements(), function( placement ) {
						partial.renderPlacementContent( placement, data.rendered );
					} );
				} );
			} );
		},

		/**
		 * Render text as the content for a placement.
		 *
		 * @param {wp.customize.selectiveRefresh.Placement} placement - Placement.
		 * @param {string} text - Rendered text.
		 * @returns {void}
		 */
		renderPlacementContent: function renderPlacementContent( placement, text ) {
			var partial = this;
			partial.renderContent( _.extend(
				{},
				placement,
				{
					addedContent: text
				}
			) );
		},

		/**
		 * Refresh.
		 *
		 * Override refresh behavior to apply changes with JS instead of doing
		 * a selective refresh request for PHP rendering (since unnecessary).
		 *
		 * @returns {jQuery.promise} Resolved promise.
		 */
		refresh: function() {
			var partial = this, setting;
			setting = api( _.first( partial.settings() ) );

			// Render instant low-fidelity.
			_.each( partial.placements(), function( placement ) {
				var text = _.escape( setting.get().replace( /<[^>]+>/g, '' ) ); // Strip tags and then escape.
				partial.renderPlacementContent( placement, text );
			} );

			// Update with high-fidelity rendered content.
			partial.renderFetchedContent();

			// Return resolved promise since no server-side selective refresh will be requested.
			return $.Deferred().resolve().promise();
		}

	} );

	// Add the partial for the site title. The title should really be getting rendered with React.
	api.bind( 'preview-ready', function() {
		api.selectiveRefresh.partial.add( new RestApiRenderedTextPartial( 'blogname', {
			selector: '.site-title a',
			settings: [ 'blogname' ],
			containerInclusive: false,
			endpoint: wpApiSettings.root + 'foxhound/v1/title/'
		} ) );
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
