export interface UserProps {
  id: string;
  spotifyId: string;
  displayName: string;
  email?: string;
  imageUrl?: string;
}

export class User {
  readonly id: string;
  readonly spotifyId: string;
  readonly displayName: string;
  readonly email?: string;
  readonly imageUrl?: string;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.spotifyId = props.spotifyId;
    this.displayName = props.displayName;
    this.email = props.email;
    this.imageUrl = props.imageUrl;
  }

  static create(props: UserProps): User {
    if (!props.id?.trim()) {
      throw new Error('User id is required');
    }
    if (!props.spotifyId?.trim()) {
      throw new Error('User Spotify id is required');
    }
    if (!props.displayName?.trim()) {
      throw new Error('User display name is required');
    }

    return new User({
      id: props.id.trim(),
      spotifyId: props.spotifyId.trim(),
      displayName: props.displayName.trim(),
      email: props.email?.trim() || undefined,
      imageUrl: props.imageUrl?.trim() || undefined,
    });
  }
}
