/* global _, jQuery, wp, foxhoundTheme, wpApiSettings, CustomizePreviewFeaturedImage */
( function( $, api, foxhoundTheme ) {

	const highFidelityRenderTimeout = 1000;

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
			partial.renderFetchedContent = _.debounce( partial.renderFetchedContent, highFidelityRenderTimeout );
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
			partial.fetch = _.debounce( partial.fetch, highFidelityRenderTimeout );
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
				return $.Deferred().reject().promise();
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

	// Since fetch() doesn't facilitate aborting yet.
	const existingRequests = {};

	/**
	 * Request post update.
	 *
	 * @param {object} data - Post data.
	 * @param {number} data.id - Post ID.
	 * @param {string} data.slug - Post ID.
	 * @param {string} data.type - Post type.
	 * @returns {void}
	 */
	function requestPostUpdate( data ) {
		const postTypeInterface = foxhoundTheme.postTypes[ data.type ];
		if ( ! postTypeInterface ) {
			return;
		}

		existingRequests[ data.id ] = ( existingRequests[ data.id ] || 0 ) + 1;
		const requestId = existingRequests[ data.id ];

		postTypeInterface.request( data.slug )( function( action ) {

			// Abort if another request started.
			if ( requestId < existingRequests[ data.id ] ) {
				return;
			}

			foxhoundTheme.store.dispatch( action );
		} );
	}

	/**
	 * Debounced request post update.
	 *
	 * @param {object} data - Post data.
	 * @type {Function}
	 */
	const debouncedRequestPostUpdate = _.wrap(
		_.memoize(
			() => {
				return _.debounce( requestPostUpdate, highFidelityRenderTimeout );
			},
			_.property( 'id' )
		),
		( memoized, data ) => {
			return memoized( data )( data );
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

	if ( api.selectiveRefresh.partialConstructor.post_field ) {
		api.selectiveRefresh.partialConstructor.post_field.prototype.addInstantPreviews = function() {
			/* No-op since live preview will be handled via updating store. */
		};
		api.selectiveRefresh.partialConstructor.post_field.prototype.createEditShortcutForPlacement = function() {
			/* No-op since React manages the insertion of the edit shortcuts. */
		};
		api.selectiveRefresh.partialConstructor.post_field.prototype.addEditShortcutToPlacement = function() {
			/* No-op since React manages the insertion of the edit shortcuts. */
		};

		/**
		 * Update the store with the new post setting value.
		 *
		 * @return {jQuery.Promise} Promise.
		 */
		api.selectiveRefresh.partialConstructor.post_field.prototype.refresh = function refresh() {
			const partial = this;
			const postType = partial.params.post_type;
			const postId = partial.params.post_id;

			// Only posts and pages are currently supported.
			if ( ! foxhoundTheme.postTypes[ postType ] ) {
				return $.Deferred().reject().promise();
			}

			const postTypeInterface = foxhoundTheme.postTypes[ postType ];
			const data = _.clone( postTypeInterface.selector( foxhoundTheme.store.getState(), postId ) );
			const setting = api( _.first( partial.settings() ) );
			const value = setting.get();

			// Apply low-fidelity instant preview.
			if ( 'post_title' === partial.params.field_id ) {
				data.title.rendered = value.post_title;
			} else if ( 'post_content' === partial.params.field_id ) {
				data.content.rendered = autop( value.post_content );
			} else if ( 'post_excerpt' === partial.params.field_id ) {
				data.excerpt.rendered = autop( value.post_excerpt );
			}

			postTypeInterface.dispatchSuccess( data );

			// Apply high-fidelity rendered preview from server.
			debouncedRequestPostUpdate( data );

			return $.Deferred().resolve().promise();
		};
	}

	if ( typeof CustomizePreviewFeaturedImage !== 'undefined' && CustomizePreviewFeaturedImage.FeaturedImagePartial ) {

		/**
		 * Update the store with the newly-selected featured image for the post.
		 *
		 * @return {jQuery.Promise} Promise.
		 */
		CustomizePreviewFeaturedImage.FeaturedImagePartial.prototype.refresh = function refresh() {
			const partial = this;
			const postType = partial.params.post_type;
			const postId = partial.params.post_id;

			// Only posts and pages are currently supported.
			if ( ! foxhoundTheme.postTypes[ postType ] ) {
				return $.Deferred().reject().promise();
			}

			const postTypeInterface = foxhoundTheme.postTypes[ postType ];
			const data = _.clone( postTypeInterface.selector( foxhoundTheme.store.getState(), postId ) );

			requestPostUpdate( data );

			return $.Deferred().resolve().promise();
		};
	}
} )( jQuery, wp.customize, foxhoundTheme );
