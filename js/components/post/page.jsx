/* global FoxhoundSettings */
import React from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import DocumentMeta from 'react-document-meta';
import BodyClass from 'components/react-body-class';
import he from 'he';

// Internal dependencies
import QueryPage from 'wordpress-query-page';
import { getPageIdFromPath, isRequestingPage, getPage } from 'wordpress-query-page/lib/selectors';
import ContentMixin from 'utils/content-mixin';

// Components
import Media from './image';
import Comments from 'components/comments';
import CustomizePostFieldPartial from 'components/customize-post-field-partial';
import Placeholder from 'components/placeholder';
import PostPreview from './preview';

const SinglePage = React.createClass( {
	mixins: [ ContentMixin ],

	renderArticle() {
		const post = this.props.post;
		if ( ! post ) {
			return null;
		}

		const meta = {
			title: post.title.rendered + ' – ' + FoxhoundSettings.meta.title,
			description: post.excerpt.rendered,
			canonical: post.link,
		};
		meta.title = he.decode( meta.title );

		const classes = classNames( {
			entry: true,
			hentry: true,
			[ `post-${post.id}` ]: true
		} );
		const featuredMedia = this.getFeaturedMedia( post );

		return (
			<article id={ `post-${ post.id }` } className={ classes }>
				<DocumentMeta { ...meta } />
				<BodyClass classes={ [ 'page', 'single', 'single-page' ] } />
				<CustomizePostFieldPartial post={ post } field="title">
					<h1 className="entry-title" dangerouslySetInnerHTML={ this.getTitle( post ) } />
				</CustomizePostFieldPartial>
				{ featuredMedia ?
					<Media media={ featuredMedia } parentClass='entry-image' /> :
					null
				}
				<div className="entry-meta"></div>
				<CustomizePostFieldPartial post={ post } field="content">
					<div className="entry-content" dangerouslySetInnerHTML={ this.getContent( post ) } />
				</CustomizePostFieldPartial>
			</article>
		);
	},

	renderComments() {
		const post = this.props.post;
		if ( ! post ) {
			return null;
		}

		return (
			<Comments
				postId={ this.props.postId }
				title={ <span dangerouslySetInnerHTML={ this.getTitle( post ) } /> }
				commentsOpen={ 'open' === post.comment_status } />
		)
	},

	render() {
		if ( this.props.previewId ) {
			return (
				<PostPreview id={ this.props.previewId } />
			);
		}

		return (
			<div className="card">
				<QueryPage pagePath={ this.props.path } />

				{ this.props.loading ?
					<Placeholder type="page" /> :
					this.renderArticle()
				}

				{ ! this.props.loading && this.renderComments() }
			</div>
		);
	}
} );

export default connect( ( state, ownProps ) => {
	let path = ownProps.params.splat || ownProps.route.slug;
	if ( '/' === path[ path.length - 1 ] ) {
		path = path.slice( 0, -1 );
	}

	const postId = getPageIdFromPath( state, path );
	const requesting = isRequestingPage( state, path );
	const post = getPage( state, parseInt( postId, 10 ) );

	const previewId = ownProps.location.query.preview_id;

	return {
		previewId,
		path,
		postId,
		post,
		requesting,
		loading: requesting && ! post
	};
} )( SinglePage );
