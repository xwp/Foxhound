/*global FoxhoundSettings */
// External dependencies
import React from 'react';
import classNames from 'classnames';
import { Link } from 'react-router';
import CustomizePostFieldPartial from 'components/customize-post-field-partial';

// Internal dependencies
import ContentMixin from 'utils/content-mixin';

let Post = React.createClass( {
	mixins: [ ContentMixin ],

	render: function() {
		let post = this.props;

		if ( 'attachment' === post.type ) {
			return null;
		}

		let classes = classNames( {
			entry: true,
			hentry: true,
			[ `post-${post.id}` ]: true
		} );

		let path = post.link.replace( FoxhoundSettings.URL.base, FoxhoundSettings.URL.path );

		return (
			<article id={ `post-${post.id}` } className={ classes }>
				<h2 className="entry-title">
					<CustomizePostFieldPartial post={ post } field="title">
						<Link to={ path } rel="bookmark" dangerouslySetInnerHTML={ this.getTitle( post ) } />
					</CustomizePostFieldPartial>
				</h2>

				<CustomizePostFieldPartial post={ post } field="content">
					<div className="entry-content" dangerouslySetInnerHTML={ this.getExcerpt( post ) } />
				</CustomizePostFieldPartial>

				<div className="entry-meta">
					<div className="entry-meta-label">published</div>
					<div className="entry-meta-value">
						<a href={ post.link } rel="bookmark">
							<time className="entry-date published updated" dateTime={ post.date }>{ this.getDate( post ) }</time>
						</a>
					</div>
				</div>
			</article>
		);
	}
} );

export default Post;
