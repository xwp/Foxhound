/* global _, jQuery, wp, foxhoundTheme, wpApiSettings */
( function( $, api, foxhoundTheme ) {

	/**
	 * Partial for previewing a value that is available as both raw/rendered via a REST API endpoint.
	 *
	 * @class
	 * @augments wp.customize.selectiveRefresh.Partial
	 * @since 4.5.0
	 */
	const RestApiRenderedTextPartial = api.selectiveRefresh.Partial.extend( {
		/* eslint consistent-this: [ "error", "partial" ] */

		/**
		 * @inheritDoc
		 */
		initialize: function( id, options ) {
			const partial = this;
			api.selectiveRefresh.Partial.prototype.initialize.call( this, id, options );
			partial.renderFetchedContent = _.debounce( partial.renderFetchedContent, api.settings.timeouts.selectiveRefresh );
		},

		/**
		 * Fetch endpoint and render the rendered content.
		 *
		 * @returns {void}
		 */
		renderFetchedContent: function renderFetchedContent() {
			const partial = this;
			fetch( partial.params.endpoint ).then( ( response ) => {
				response.json().then( ( data ) => {
					if ( 'undefined' === typeof data.rendered ) {
						throw new Error( 'Endpoint did not include rendered data.' );
					}
					_.each( partial.placements(), ( placement ) => {
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
			const partial = this;
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
			const partial = this;
			const setting = api( _.first( partial.settings() ) );

			// Render instant low-fidelity.
			_.each( partial.placements(),( placement ) => {
				const text = _.escape( setting.get().replace( /<[^>]+>/g, '' ) ); // Strip tags and then escape.
				partial.renderPlacementContent( placement, text );
			} );

			// Update with high-fidelity rendered content.
			partial.renderFetchedContent();

			// Return resolved promise since no server-side selective refresh will be requested.
			return $.Deferred().resolve().promise();
		}

	} );

	// Add the partial for the site title. The title should really be getting rendered with React.
	api.bind( 'preview-ready', () => {
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
		const link = $( event.target );

		// No-op if the anchor is not a link.
		if ( _.isUndefined( link.attr( 'href' ) ) ) {
			return;
		}

		const isInternalJumpLink = ( '#' === link.attr( 'href' ).substr( 0, 1 ) );

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
	 * Partial for previewing a nav menu location.
	 *
	 * @class
	 * @augments wp.customize.navMenusPreview.NavMenuInstancePartial
	 */
	const NavMenuInstancePartial = api.navMenusPreview.NavMenuInstancePartial.extend( {

		/**
		 * @inheritDoc
		 */
		initialize: function( id, options ) {
			const partial = this;
			api.navMenusPreview.NavMenuInstancePartial.prototype.initialize.call( this, id, options );
			partial.fetch = _.debounce( partial.fetch, api.settings.timeouts.selectiveRefresh );
		},

		/**
		 * Fetch the nav menu location and update the store.
		 *
		 * This will get debounced.
		 *
		 * @returns {void}
		 */
		fetch: function() {
			const partial = this;
			foxhoundTheme.requestMenu( partial.params.navMenuArgs.theme_location )( function( action ) {
				foxhoundTheme.store.dispatch( action );
			} );
		},

		/**
		 * Refresh partial.
		 *
		 * @todo This is not currently able to dispatch nav menu item changes directly into the store. Once it can, then updates will be instant.
		 *
		 * @returns {Promise} Rejected promise when nav menu location is not available.
		 */
		refresh: function() {
			const partial = this;
			if ( ! partial.params.navMenuArgs || ! partial.params.navMenuArgs.theme_location ) {
				return $.Deferred().reject().promise();
			}

			const navMenuLocationSetting = api( 'nav_menu_locations[' + partial.params.navMenuArgs.theme_location + ']' );
			if ( ! navMenuLocationSetting ) {
				return $.Deferred().reject().promise();;
			}

			const unprocessedItems = {};
			api.each( ( setting ) => {
				const value = setting.get();
				const matches = setting.id.match( /^nav_menu_item\[(-?\d+)]$/ );
				if ( ! matches || value.nav_menu_term_id !== navMenuLocationSetting.get() ) {
					return;
				}
				const navMenuItemId = parseInt( matches[1], 10 );
				const item = {
					ID: navMenuItemId,
					attr: value.attr_title,
					classes: value.classes,
					description: value.description,
					object: value.object,
					object_id: value.object_id,
					order: value.position,
					parent: value.menu_item_parent,
					target: value.target,
					title: value.title || value.original_title,
					type: value.type,
					type_label: value.type_label,
					url: value.url,
					xfn: value.xfn,
					children: []
				};
				unprocessedItems[ item.ID ] = item;
			} );

			/**
			 * Get nav menu items in tree.
			 *
			 * @param {int} parent - Parent item ID.
			 * @return {Array} Nav menu items.
			 */
			const getItems = ( parent ) => {
				const items = [];
				for ( const item of Object.values( unprocessedItems ) ) {
					if ( parent === item.parent ) {
						item.children = getItems( item.ID );
						items.push( item );
						delete unprocessedItems[ item.ID ];
					}
				}
				return items.sort( ( a, b ) => a.order - b.order );
			};

			const items = getItems( 0 );
			foxhoundTheme.actions.setMenu( partial.params.navMenuArgs.theme_location, items );

			// @todo This is now unnecessary.
			partial.fetch();

			return $.Deferred().resolve().promise();
		}
	} );

	// Override nav menu instance partial with one that speaks React.
	api.selectiveRefresh.partialConstructor.nav_menu_instance = NavMenuInstancePartial;

	/**
	 * Request post update.
	 *
	 * @param {object} data - Post data.
	 * @returns {void}
	 */
	function requestPostUpdate( data ) {
		const postTypeInterface = foxhoundTheme.postTypes[ data.type ];
		if ( ! postTypeInterface ) {
			return;
		}
		postTypeInterface.request( data.slug )( function( action ) {
			foxhoundTheme.store.dispatch( action ); // @todo Do we need store here?
		} );
	}

	const debouncedRequestPostUpdate = _.wrap(
		_.memoize(
			() => {
				return _.debounce( requestPostUpdate, api.settings.timeouts.selectiveRefresh );
			},
			_.property( 'id' )
		),
		( func, obj ) => {
			return func( obj )( obj );
		}
	);

	/**
	 * Autop.
	 *
	 * There is a fuller implementation of this in editor.js which we could use instead if we want to.
	 * In any case, this is just for instant preview while waiting for server-rendered value.
	 *
	 * @param {string} text - Text to add paragraphs and breaks to.
	 * @returns {string} Paragraphed text.
	 */
	const autop = function( text ) {
		return text.split( /\n\n+/ ).map(
			( paragraph ) => '<p>' + paragraph.replace( /\n/g, '<br>' ) + '</p>'
		).join( '' );
	};

	/**
	 * Listen to post and postmeta changes and sync into store.
	 */
	api.bind( 'change', function( setting ) {
		const idParts = setting.id.replace( /]/g, '' ).split( /\[/ );
		const settingType = idParts.shift();

		if ( 'post' !== settingType && 'postmeta' !== settingType ) {

			// @todo Support nav menus.
			return;
		}

		const postType = idParts.shift();

		// Only posts and pages are currently supported.
		if ( ! foxhoundTheme.postTypes[ postType ] ) {
			return;
		}
		const postTypeInterface = foxhoundTheme.postTypes[ postType ];

		const postId = parseInt( idParts.shift(), 10 );
		if ( isNaN( postId ) ) {
			return;
		}
		let metaKey = null;
		if ( 'postmeta' === settingType ) {
			metaKey = idParts.shift();
			if ( ! metaKey ) {
				return;
			}
		}

		if ( 'post' === settingType ) {
			const data = _.clone( postTypeInterface.selector( foxhoundTheme.store.getState(), postId ) );
			const value = setting.get();

			// Apply low-fidelity instant preview.
			data.title.rendered = value.post_title;
			data.content.rendered = autop( value.post_content );
			data.excerpt.rendered = autop( value.post_excerpt );
			postTypeInterface.dispatchSuccess( data );

			// Apply high-fidelity rendered preview from server.
			debouncedRequestPostUpdate( data );
		}
	} );
} )( jQuery, wp.customize, foxhoundTheme );
